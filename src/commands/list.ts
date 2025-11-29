import { Command } from 'commander';
import { ApiClient } from '../utils/ApiClient';
import { StorageManager } from '../utils/StorageManager';
import chalk from 'chalk';
import ora from 'ora';

export const listCommand = new Command('list')
    .description('List all your projects')
    .action(async () => {
        const spinner = ora('Fetching projects...').start();

        try {
            const storage = new StorageManager();
            const token = await storage.getAccessToken();

            if (!token) {
                spinner.fail('You are not logged in. Run "dotveil login" first.');
                return;
            }

            const api = new ApiClient();
            api.setAccessToken(token);

            const projects = await api.listProjects();

            if (projects.length === 0) {
                spinner.info('You have no projects yet.');
                console.log(chalk.gray('Run "dotveil init" to create one.'));
                return;
            }

            spinner.stop();

            console.log(chalk.bold('\nYour Projects:'));
            console.log('─'.repeat(50));

            // Simple table output
            console.log(
                chalk.cyan('Name').padEnd(20) +
                chalk.gray('ID').padEnd(25) +
                chalk.green('Updated')
            );
            console.log('─'.repeat(50));

            projects.forEach((p: any) => {
                console.log(
                    chalk.white(p.name).padEnd(20) +
                    chalk.gray(p.id.substring(0, 20) + '...').padEnd(25) +
                    chalk.gray(new Date(p.updatedAt).toLocaleDateString())
                );
            });
            console.log('');

        } catch (error: any) {
            spinner.fail('Failed to list projects');
            if (error.response?.status === 401) {
                console.error(chalk.red('Session expired. Please login again.'));
            } else {
                console.error(chalk.red(error.message));
            }
        }
    });
