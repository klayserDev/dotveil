import { Command } from 'commander';
import { ApiClient } from '../utils/ApiClient';
import { StorageManager } from '../utils/StorageManager';
import chalk from 'chalk';
import inquirer from 'inquirer';
import fs from 'fs-extra';
import path from 'path';

export const switchCommand = new Command('switch')
    .description('Switch the active project in dotveil.json')
    .action(async () => {
        try {
            const apiClient = new ApiClient();
            const storage = new StorageManager();

            if (!(await storage.isLoggedIn())) {
                console.log(chalk.red('❌ You must be logged in to switch projects.'));
                console.log('Run ' + chalk.cyan('dotveil login') + ' first.');
                return;
            }

            const token = await storage.getAccessToken();
            if (token) apiClient.setAccessToken(token);

            // List projects
            const projects = await apiClient.listProjects();

            if (projects.length === 0) {
                console.log(chalk.yellow('You have no projects.'));
                return;
            }

            // Prompt selection
            const { project } = await inquirer.prompt([
                {
                    type: 'list',
                    name: 'project',
                    message: 'Select a project to switch to:',
                    choices: projects.map((p: any) => ({
                        name: `${p.name} ${!p.isActive ? chalk.red('(Inactive)') : ''}`,
                        value: p
                    })),
                },
            ]);

            // Update dotveil.json
            const configPath = path.join(process.cwd(), 'dotveil.json');
            const config = {
                projectId: project.id,
                projectName: project.name,
                environment: 'dev' // Default to dev, or preserve existing if possible?
            };

            // Preserve existing environment if dotveil.json exists
            if (await fs.pathExists(configPath)) {
                try {
                    const existingConfig = await fs.readJson(configPath);
                    if (existingConfig.environment) {
                        config.environment = existingConfig.environment;
                    }
                } catch (e) {
                    // Ignore error reading existing config
                }
            }

            await fs.writeJson(configPath, config, { spaces: 2 });
            console.log(chalk.green(`✅ Switched to project ${project.name}`));

            if (!project.isActive) {
                console.log(chalk.yellow('⚠️  This project is inactive. You cannot pull/push secrets until it is reactivated.'));
                console.log(chalk.yellow('   You can delete it using: ') + chalk.cyan(`dotveil delete ${project.name}`));
            } else {
                console.log(chalk.blue('Run ') + chalk.cyan('dotveil pull') + chalk.blue(' to download secrets.'));
            }

        } catch (error: any) {
            console.error(chalk.red('Error switching project:'), error.response?.data?.error || error.message);
        }
    });
