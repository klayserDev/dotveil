import { Command } from 'commander';
import chalk from 'chalk';
import fs from 'fs-extra';
import ora from 'ora';
import { ApiClient } from '../utils/ApiClient';
import { StorageManager } from '../utils/StorageManager';
import inquirer from 'inquirer';

export const envCommand = new Command('env')
    .description('Manage project environments');

envCommand.command('list')
    .description('List all environments')
    .action(async () => {
        const apiClient = new ApiClient();
        const storage = new StorageManager();

        if (!(await storage.isLoggedIn())) {
            console.log(chalk.red('❌ You must be logged in.'));
            return;
        }

        const token = await storage.getAccessToken();
        if (token) apiClient.setAccessToken(token);

        if (!(await fs.pathExists('dotveil.json'))) {
            console.log(chalk.red('❌ dotveil.json not found. Run dotveil init first.'));
            return;
        }

        const spinner = ora('Fetching environments...').start();

        try {
            const config = await fs.readJSON('dotveil.json');
            const envs = await apiClient.listEnvironments(config.projectId);
            const currentEnv = config.environment;

            spinner.stop();

            if (envs.length === 0) {
                console.log(chalk.yellow('No environments found.'));
            } else {
                console.log(chalk.bold('\nEnvironments:'));
                envs.forEach((env: any) => {
                    const isSelected = env.name === currentEnv;
                    const prefix = isSelected ? chalk.green('* ') : '  ';
                    const name = isSelected ? chalk.green(env.name) : chalk.cyan(env.name);
                    console.log(`${prefix}${name}`);
                });
                console.log('');
            }
        } catch (error: any) {
            spinner.fail('Failed to list environments');
            console.error(chalk.red(error.response?.data?.error || error.message));
        }
    });

envCommand.command('create <name>')
    .description('Create a new environment')
    .action(async (name) => {
        const apiClient = new ApiClient();
        const storage = new StorageManager();

        if (!(await storage.isLoggedIn())) {
            console.log(chalk.red('❌ You must be logged in.'));
            return;
        }

        const token = await storage.getAccessToken();
        if (token) apiClient.setAccessToken(token);

        if (!(await fs.pathExists('dotveil.json'))) {
            console.log(chalk.red('❌ dotveil.json not found. Run dotveil init first.'));
            return;
        }

        const spinner = ora(`Creating environment "${name}"...`).start();

        try {
            const config = await fs.readJSON('dotveil.json');
            await apiClient.createEnvironment(config.projectId, name);

            // Auto-select the new environment
            config.environment = name;
            await fs.writeJSON('dotveil.json', config, { spaces: 2 });

            spinner.succeed(chalk.green(`Environment "${name}" created and selected!`));
        } catch (error: any) {
            spinner.fail('Failed to create environment');
            console.error(chalk.red(error.response?.data?.error || error.message));
        }
    });

envCommand.command('delete <name>')
    .description('Delete an environment')
    .action(async (name) => {
        const apiClient = new ApiClient();
        const storage = new StorageManager();

        if (!(await storage.isLoggedIn())) {
            console.log(chalk.red('❌ You must be logged in.'));
            return;
        }

        const token = await storage.getAccessToken();
        if (token) apiClient.setAccessToken(token);

        if (!(await fs.pathExists('dotveil.json'))) {
            console.log(chalk.red('❌ dotveil.json not found. Run dotveil init first.'));
            return;
        }

        const { confirm } = await inquirer.prompt([
            {
                type: 'confirm',
                name: 'confirm',
                message: `Are you sure you want to delete environment "${name}"? This cannot be undone.`,
                default: false,
            },
        ]);

        if (!confirm) {
            console.log('Aborted.');
            return;
        }

        const spinner = ora(`Deleting environment "${name}"...`).start();

        try {
            const config = await fs.readJSON('dotveil.json');
            await apiClient.deleteEnvironment(config.projectId, name);
            spinner.succeed(chalk.green(`Environment "${name}" deleted!`));
        } catch (error: any) {
            spinner.fail('Failed to delete environment');
            console.error(chalk.red(error.response?.data?.error || error.message));
        }
    });

envCommand.command('select <name>')
    .description('Select an environment')
    .action(async (name) => {
        if (!(await fs.pathExists('dotveil.json'))) {
            console.log(chalk.red('❌ dotveil.json not found. Run dotveil init first.'));
            return;
        }

        try {
            const config = await fs.readJSON('dotveil.json');

            // Verify environment exists
            const apiClient = new ApiClient();
            const storage = new StorageManager();
            if (await storage.isLoggedIn()) {
                const token = await storage.getAccessToken();
                if (token) apiClient.setAccessToken(token);
                try {
                    const envs = await apiClient.listEnvironments(config.projectId);
                    const exists = envs.some((e: any) => e.name === name);
                    if (!exists) {
                        console.log(chalk.yellow(`⚠️  Environment "${name}" does not exist on the server.`));
                    }
                } catch (e) {
                    // Ignore API errors here
                }
            }

            config.environment = name;
            await fs.writeJSON('dotveil.json', config, { spaces: 2 });
            console.log(chalk.green(`✅ Selected environment: ${name}`));

        } catch (error: any) {
            console.error(chalk.red('Failed to update dotveil.json'));
        }
    });
