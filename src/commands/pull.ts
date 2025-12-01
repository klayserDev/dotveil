import { Command } from 'commander';
import chalk from 'chalk';
import fs from 'fs-extra';
import ora from 'ora';
import { ApiClient } from '../utils/ApiClient';
import { StorageManager } from '../utils/StorageManager';
import { KeyManager } from '../utils/KeyManager';

export const pullCommand = new Command('pull')
    .description('Pull and decrypt .env file from server')
    .option('-e, --env <environment>', 'Environment (dev/prod)')
    .option('-f, --force', 'Overwrite existing .env file', false)
    .action(async (options) => {
        const apiClient = new ApiClient();
        const storage = new StorageManager();
        const keyManager = new KeyManager();

        // Check for Service Token (CI/CD Mode)
        const serviceToken = process.env.DOTVEIL_TOKEN;
        const envProjectKey = process.env.DOTVEIL_PROJECT_KEY;

        if (serviceToken) {
            console.log(chalk.blue('ℹ️  Using Service Token from DOTVEIL_TOKEN'));
            apiClient.setAccessToken(serviceToken);

            if (!envProjectKey) {
                console.log(chalk.red('❌ DOTVEIL_PROJECT_KEY is required when using a Service Token.'));
                return;
            }
        } else {
            // Check login status (User Mode)
            if (!(await storage.isLoggedIn())) {
                console.log(chalk.red('❌ You must be logged in to pull secrets.'));
                console.log('Run ' + chalk.cyan('dotveil login') + ' first.');
                return;
            }

            // Set access token
            const token = await storage.getAccessToken();
            if (token) apiClient.setAccessToken(token);
        }

        // Check dotveil.json
        if (!(await fs.pathExists('dotveil.json'))) {
            console.log(chalk.red('❌ dotveil.json not found.'));
            console.log('Run ' + chalk.cyan('dotveil init') + ' first.');
            return;
        }

        const spinner = ora('Pulling secrets...').start();

        try {
            // Read config
            const config = await fs.readJSON('dotveil.json');
            const projectId = config.projectId;

            // Determine environment
            const environment = options.env || config.environment || 'dev';

            // Download secrets
            const { encryptedData, iv, encryptedProjectKey, sha256 } = await apiClient.downloadSecrets(projectId, environment);

            // Smart Pull check removed to ensure local changes are detected.
            // We will compare decrypted content later.

            let projectKey: string;

            if (serviceToken && envProjectKey) {
                // Use provided project key directly
                projectKey = envProjectKey;
            } else {
                // Get user's private key
                const privateKey = await storage.getPrivateKey();
                if (!privateKey) {
                    throw new Error('Private key not found. Please re-login.');
                }

                if (!encryptedProjectKey) {
                    throw new Error('No encrypted project key returned from server.');
                }

                // Decrypt project key
                projectKey = keyManager.decryptMessage(encryptedProjectKey, privateKey);
            }

            // Decrypt .env content
            const remoteEnvContent = keyManager.decryptEnvFile(encryptedData, projectKey, iv);

            // If .env exists, show diff
            if (await fs.pathExists('.env')) {
                const localEnvContent = await fs.readFile('.env', 'utf8');

                // If content is identical, just update state and exit
                if (localEnvContent === remoteEnvContent) {
                    if (sha256) {
                        config.state = config.state || {};
                        config.state[environment] = sha256;
                        await fs.writeJSON('dotveil.json', config, { spaces: 2 });
                    }
                    spinner.succeed(chalk.green(`Secrets for ${environment} are already up to date.`));
                    return;
                }

                spinner.stop();

                // Parse envs for diff
                const dotenv = require('dotenv');
                const localEnv = dotenv.parse(localEnvContent);
                const remoteEnv = dotenv.parse(remoteEnvContent);

                // Calculate diff
                const allKeys = new Set([...Object.keys(localEnv), ...Object.keys(remoteEnv)]);
                const changes: string[] = [];

                allKeys.forEach(key => {
                    const localVal = localEnv[key];
                    const remoteVal = remoteEnv[key];

                    if (localVal !== undefined && remoteVal === undefined) {
                        changes.push(chalk.red(`- ${key}`)); // Removed in remote (so we remove from local)
                    } else if (localVal === undefined && remoteVal !== undefined) {
                        changes.push(chalk.green(`+ ${key}`)); // Added in remote
                    } else if (localVal !== remoteVal) {
                        changes.push(chalk.yellow(`~ ${key}`)); // Changed
                    }
                });

                if (changes.length > 0) {
                    console.log(chalk.bold(`\n📝 Changes from ${environment} (Remote) vs Local:`));
                    changes.forEach(change => console.log(change));
                    console.log('');

                    if (!options.force && !serviceToken) {
                        const inquirer = (await import('inquirer')).default;
                        const { confirm } = await inquirer.prompt([
                            {
                                type: 'confirm',
                                name: 'confirm',
                                message: 'Do you want to overwrite your local .env with these changes?',
                                default: false,
                            },
                        ]);

                        if (!confirm) {
                            console.log('Aborted.');
                            return;
                        }
                    }
                }
                spinner.start('Updating .env...');
            }

            // Verify SHA-256 (after decryption to ensure integrity of what we downloaded)
            if (sha256) {
                const calculatedSha256 = require('crypto').createHash('sha256').update(encryptedData).digest('hex');
                if (calculatedSha256 !== sha256) {
                    throw new Error('SHA-256 checksum mismatch! The file may have been tampered with.');
                }
            }

            // Write to .env
            await fs.writeFile('.env', remoteEnvContent);

            // Update state
            if (sha256) {
                config.state = config.state || {};
                config.state[environment] = sha256;
                await fs.writeJSON('dotveil.json', config, { spaces: 2 });
            }

            spinner.succeed(chalk.green(`Secrets pulled from ${environment} environment!`));
        } catch (error: any) {
            spinner.fail('Failed to pull secrets');
            if (error.response?.status === 403) {
                console.error(chalk.red('⛔ Permission denied: ' + (error.response?.data?.error || 'You do not have permission to pull from this environment.')));
                console.log(chalk.gray('Check your role in the project settings or ask an admin for access.'));
            } else {
                console.error(chalk.red(error.response?.data?.error || error.message));
            }
        }
    });
