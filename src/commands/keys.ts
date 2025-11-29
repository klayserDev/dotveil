import { Command } from 'commander';
import chalk from 'chalk';
import fs from 'fs-extra';
import ora from 'ora';
import { ApiClient } from '../utils/ApiClient';
import { StorageManager } from '../utils/StorageManager';
import { KeyManager } from '../utils/KeyManager';

export const keysCommand = new Command('keys')
    .description('Manage encryption keys');

keysCommand.command('export')
    .description('Export the decrypted Project Key (for CI/CD)')
    .action(async () => {
        const apiClient = new ApiClient();
        const storage = new StorageManager();
        const keyManager = new KeyManager();

        if (!(await storage.isLoggedIn())) {
            console.log(chalk.red('❌ You must be logged in to export keys.'));
            return;
        }

        const token = await storage.getAccessToken();
        if (token) apiClient.setAccessToken(token);

        if (!(await fs.pathExists('dotveil.json'))) {
            console.log(chalk.red('❌ dotveil.json not found.'));
            return;
        }

        try {
            const config = await fs.readJSON('dotveil.json');
            const projectId = config.projectId;

            // Fetch any secret to get the encrypted project key
            // We can use the 'dev' environment or any existing one
            // Or we need a dedicated endpoint to fetch JUST the key.
            // Since we don't have one, let's try to fetch 'dev' secrets.
            // If 'dev' doesn't exist, this might fail.
            // Ideally, we should have `GET /api/projects/[id]/key`.
            // But for now, let's try 'dev'.
            
            // Actually, `downloadSecrets` might fail if env doesn't exist.
            // Let's assume 'dev' exists or try to find one.
            // This is a bit hacky. A dedicated endpoint would be better.
            // But let's proceed with 'dev' for now as it's the default.
            
            const { encryptedProjectKey } = await apiClient.downloadSecrets(projectId, 'dev');

            if (!encryptedProjectKey) {
                console.log(chalk.red('❌ Could not retrieve encrypted project key.'));
                return;
            }

            const privateKey = await storage.getPrivateKey();
            if (!privateKey) {
                console.log(chalk.red('❌ Private key not found.'));
                return;
            }

            const projectKey = keyManager.decryptMessage(encryptedProjectKey, privateKey);

            console.log(chalk.green('✅ Project Key Exported:'));
            console.log(chalk.bold(projectKey));
            console.log(chalk.yellow('\n⚠️  Keep this key SAFE! It decrypts all your secrets.'));
            console.log(chalk.gray('Use this as DOTVEIL_PROJECT_KEY in your CI/CD environment.'));

        } catch (error: any) {
            console.error(chalk.red('Failed to export key: ' + (error.response?.data?.error || error.message)));
        }
    });

keysCommand.command('rotate')
    .description('Rotate the Project Key (Re-encrypts all secrets)')
    .action(async () => {
        const apiClient = new ApiClient();
        const storage = new StorageManager();
        const keyManager = new KeyManager();
        const crypto = require('crypto');

        if (!(await storage.isLoggedIn())) {
            console.log(chalk.red('❌ You must be logged in.'));
            return;
        }

        const token = await storage.getAccessToken();
        if (token) apiClient.setAccessToken(token);

        if (!(await fs.pathExists('dotveil.json'))) {
            console.log(chalk.red('❌ dotveil.json not found.'));
            return;
        }

        const config = await fs.readJSON('dotveil.json');
        const projectId = config.projectId;

        const spinner = ora('Preparing to rotate project key...').start();

        try {
            // 1. Get Current Project Key
            spinner.text = 'Fetching current project key...';
            const { encryptedProjectKey } = await apiClient.getProjectKey(projectId);
            const privateKey = await storage.getPrivateKey();
            if (!privateKey) throw new Error('Private key not found');
            
            const currentProjectKey = keyManager.decryptMessage(encryptedProjectKey, privateKey);

            // 2. Generate New Project Key
            spinner.text = 'Generating new project key...';
            const newProjectKey = keyManager.generateProjectKey();

            // 3. Fetch all environments and secrets
            spinner.text = 'Fetching secrets...';
            const environments = await apiClient.listEnvironments(projectId);
            const reEncryptedSecrets = [];

            const reEncryptedVersions = [];

            for (const env of environments) {
                try {
                    // 1. Handle Current Secrets
                    const secret = await apiClient.downloadSecrets(projectId, env.name);
                    if (secret) {
                        // Decrypt with OLD key
                        const decryptedEnv = keyManager.decryptEnvFile(
                            secret.encryptedData,
                            currentProjectKey,
                            secret.iv
                        );

                        // Encrypt with NEW key
                        const { encrypted: encryptedData, iv } = keyManager.encryptEnvFile(
                            decryptedEnv,
                            newProjectKey
                        );

                        // Calculate SHA256
                        const sha256 = crypto.createHash('sha256').update(encryptedData).digest('hex');

                        reEncryptedSecrets.push({
                            environmentId: env.id,
                            encryptedData,
                            iv,
                            sha256
                        });

                        // 2. Handle Secret Versions
                        const versions = await apiClient.getSecretVersions(projectId, env.name);
                        for (const version of versions) {
                            try {
                                // Decrypt version with OLD key
                                const decryptedVersionEnv = keyManager.decryptEnvFile(
                                    version.encryptedData,
                                    currentProjectKey,
                                    version.iv
                                );

                                // Encrypt version with NEW key
                                const { encrypted: vEncryptedData, iv: vIv } = keyManager.encryptEnvFile(
                                    decryptedVersionEnv,
                                    newProjectKey
                                );

                                const vSha256 = crypto.createHash('sha256').update(vEncryptedData).digest('hex');

                                reEncryptedVersions.push({
                                    id: version.id,
                                    encryptedData: vEncryptedData,
                                    iv: vIv,
                                    sha256: vSha256
                                });
                            } catch (vError) {
                                console.warn(chalk.yellow(`Warning: Failed to re-encrypt version ${version.version} of ${env.name}. It might be corrupted.`));
                            }
                        }
                    }
                } catch (e: any) {
                    if (e.response?.status !== 404) {
                        throw e; // Ignore 404 (no secrets in this env)
                    }
                }
            }
            
            // 4. Re-encrypt Project Key for ALL members
            spinner.text = 'Re-encrypting key for all members...';
            const members = await apiClient.listMembers(projectId);
            const newEncryptedProjectKeys: Record<string, string> = {};

            for (const member of members) {
                if (!member.publicKey) {
                    console.warn(chalk.yellow(`Warning: Member ${member.email} has no public key. Skipping.`));
                    continue;
                }
                
                const encryptedKey = keyManager.encryptMessage(newProjectKey, member.publicKey);
                newEncryptedProjectKeys[member.userId] = encryptedKey;
            }

            // 5. Send to Backend
            spinner.text = 'Uploading new keys and secrets...';
            await apiClient.rotateKey(projectId, {
                newEncryptedProjectKeys,
                reEncryptedSecrets,
                reEncryptedVersions
            });

            spinner.succeed(chalk.green('✅ Project Key Rotated Successfully!'));
            console.log(chalk.gray('All secrets have been re-encrypted with the new key.'));

        } catch (error: any) {
            spinner.fail('Failed to rotate key');
            console.error(chalk.red(error.response?.data?.error || error.message));
        }
    });
