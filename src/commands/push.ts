import { Command } from 'commander';
import chalk from 'chalk';
import fs from 'fs-extra';
import ora from 'ora';
import { ApiClient } from '../utils/ApiClient';
import { StorageManager } from '../utils/StorageManager';
import { KeyManager } from '../utils/KeyManager';

export const pushCommand = new Command('push')
    .description('Push encrypted .env file to server')
    .option('-e, --env <environment>', 'Environment (dev/prod)')
    .option('-y, --yes', 'Skip confirmation', false)
    .option('--without-check', 'Skip difference check and push directly', false)
    .action(async (options) => {
        const apiClient = new ApiClient();
        const storage = new StorageManager();
        const keyManager = new KeyManager();

        // Check login status
        if (!(await storage.isLoggedIn())) {
            console.log(chalk.red('❌ You must be logged in to push secrets.'));
            console.log('Run ' + chalk.cyan('dotveil login') + ' first.');
            return;
        }

        // Set access token
        const token = await storage.getAccessToken();
        if (token) apiClient.setAccessToken(token);

        // Check dotveil.json
        if (!(await fs.pathExists('dotveil.json'))) {
            console.log(chalk.red('❌ dotveil.json not found.'));
            console.log('Run ' + chalk.cyan('dotveil init') + ' first.');
            return;
        }

        // Check .env
        if (!(await fs.pathExists('.env'))) {
            console.log(chalk.red('❌ .env file not found.'));
            return;
        }

        // Read config
        const config = await fs.readJSON('dotveil.json');
        const projectId = config.projectId;

        // Determine environment
        const environment = options.env || config.environment || 'dev';

        // Read .env
        const envContent = await fs.readFile('.env', 'utf8');

        let changeDetails: any = null;

        if (!options.withoutCheck) {
            const spinner = ora('Fetching remote secrets for diff...').start();

            // Fetch remote secrets for diff
            let remoteEnvContent = '';
            try {
                const { encryptedData, iv, encryptedProjectKey } = await apiClient.downloadSecrets(projectId, environment, { purpose: 'diff' });

                // Get user's private key
                const privateKey = await storage.getPrivateKey();
                if (privateKey) {
                    const projectKey = keyManager.decryptMessage(encryptedProjectKey, privateKey);
                    remoteEnvContent = keyManager.decryptEnvFile(encryptedData, projectKey, iv);
                }
            } catch (error: any) {
                if (error.response?.status !== 404) {
                    // console.warn(chalk.yellow('⚠️  Could not fetch remote secrets for diff:', error.message));
                }
                // If 404, it means no secrets yet, which is fine (remoteEnvContent remains empty)
            }

            spinner.stop();

            // Parse envs
            const dotenv = require('dotenv');
            const localEnv = dotenv.parse(envContent);
            const remoteEnv = dotenv.parse(remoteEnvContent);

            // Calculate diff
            const allKeys = new Set([...Object.keys(localEnv), ...Object.keys(remoteEnv)]);
            const changes: string[] = [];

            changeDetails = { added: [], removed: [], modified: [] };

            allKeys.forEach(key => {
                const localVal = localEnv[key];
                const remoteVal = remoteEnv[key];

                if (localVal !== undefined && remoteVal === undefined) {
                    changes.push(chalk.green(`+ ${key}`));
                    changeDetails.added.push(key);
                } else if (localVal === undefined && remoteVal !== undefined) {
                    changes.push(chalk.red(`- ${key}`));
                    changeDetails.removed.push(key);
                } else if (localVal !== remoteVal) {
                    changes.push(chalk.yellow(`~ ${key}`));
                    changeDetails.modified.push(key);
                }
            });

            if (changes.length === 0) {
                console.log(chalk.gray('No changes detected.'));
                return;
            } else {
                console.log(chalk.bold('\n📝 Changes to be pushed:'));
                changes.forEach(change => console.log(change));
                console.log('');
            }

            // Confirm push
            if (!options.yes) {
                const inquirer = (await import('inquirer')).default;
                const { confirm } = await inquirer.prompt([
                    {
                        type: 'confirm',
                        name: 'confirm',
                        message: `Do you want to push these changes to ${chalk.cyan(environment)}?`,
                        default: true,
                    },
                ]);

                if (!confirm) {
                    console.log('Aborted.');
                    return;
                }
            }
        } else {
            changeDetails = "skipped difference check";
            console.log(chalk.yellow('⚠️  Skipping difference check (--without-check).'));
        }

        const spinner = ora('Pushing secrets...').start();

        // Try to fetch existing project key
        let projectKey: string;
        let encryptedProjectKey: string;

        try {
            try {
                const { encryptedProjectKey: existingKey } = await apiClient.getProjectKey(projectId);
                encryptedProjectKey = existingKey;

                // Decrypt it to ensure we can use it
                const privateKey = await storage.getPrivateKey();
                if (!privateKey) throw new Error('Private key not found');
                projectKey = keyManager.decryptMessage(encryptedProjectKey, privateKey);

                // console.log(chalk.green('✔ Reusing existing project key'));
            } catch (error: any) {
                if (error.response?.status === 404) {
                    // No key exists, generate new one (first push)
                    console.log(chalk.yellow('Generating new project key...'));
                    projectKey = keyManager.generateProjectKey();

                    // Get user's public key to wrap the project key
                    const user = await apiClient.getMe();
                    if (!user.publicKey) {
                        throw new Error('User public key not found. Please re-login.');
                    }
                    encryptedProjectKey = keyManager.encryptMessage(projectKey, user.publicKey);
                } else {
                    throw error;
                }
            }

            // Encrypt .env
            const { encrypted: encryptedData, iv } = keyManager.encryptEnvFile(envContent, projectKey);

            // Calculate SHA-256 of encrypted data
            const sha256 = require('crypto').createHash('sha256').update(encryptedData).digest('hex');

            // Upload
            await apiClient.uploadSecrets(projectId, environment, {
                encryptedData,
                iv,
                encryptedProjectKey,
                sha256,
                changes: changeDetails,
            });

            spinner.succeed(chalk.green(`Secrets pushed to ${environment} environment!`));
        } catch (error: any) {
            spinner.fail('Failed to push secrets');
            if (error.response?.status === 403) {
                console.error(chalk.red('⛔ Permission denied: ' + (error.response?.data?.error || 'You do not have permission to push to this environment.')));
                console.log(chalk.gray('Check your role in the project settings or ask an admin for access.'));
            } else {
                console.error(chalk.red(error.response?.data?.error || error.message));
            }
        }
    });
