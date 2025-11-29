import { Command } from 'commander';
import { ApiClient } from '../utils/ApiClient';
import { StorageManager } from '../utils/StorageManager';
import { pullCommand } from './pull';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import fs from 'fs-extra';
import path from 'path';

export const cloneCommand = new Command('clone')
    .description('Clone a project to the current directory')
    .argument('[project-name]', 'Name of the project to clone')
    .action(async (projectName) => {
        const spinner = ora('Checking authentication...').start();

        try {
            const storage = new StorageManager();
            const token = await storage.getAccessToken();

            if (!token) {
                spinner.fail('You are not logged in. Run "dotveil login" first.');
                return;
            }

            const api = new ApiClient();
            api.setAccessToken(token);

            spinner.text = 'Fetching projects...';
            const projects = await api.listProjects();

            if (projects.length === 0) {
                spinner.fail('You have no projects to clone.');
                return;
            }

            spinner.stop();

            let selectedProject;

            if (projectName) {
                selectedProject = projects.find((p: any) => p.name === projectName);
                if (!selectedProject) {
                    console.error(chalk.red(`Project "${projectName}" not found.`));
                    return;
                }
            } else {
                const answer = await inquirer.prompt([
                    {
                        type: 'list',
                        name: 'project',
                        message: 'Select a project to clone:',
                        choices: projects.map((p: any) => ({ name: p.name, value: p })),
                    },
                ]);
                selectedProject = answer.project;
            }

            // Check if dotveil.json already exists
            const configPath = path.join(process.cwd(), 'dotveil.json');
            if (await fs.pathExists(configPath)) {
                const overwrite = await inquirer.prompt([
                    {
                        type: 'confirm',
                        name: 'confirm',
                        message: 'dotveil.json already exists. Overwrite?',
                        default: false,
                    },
                ]);
                if (!overwrite.confirm) {
                    console.log(chalk.yellow('Clone cancelled.'));
                    return;
                }
            }

            // Create dotveil.json
            const config = {
                projectId: selectedProject.id,
                projectName: selectedProject.name,
            };

            await fs.writeJson(configPath, config, { spaces: 2 });
            console.log(chalk.green(`\nInitialized ${selectedProject.name} in ${process.cwd()}`));

            // Run pull
            console.log(chalk.blue('\nPulling secrets...'));
            // We can't easily invoke the command object directly with arguments programmatically in commander 
            // without parsing argv. So we'll just call the action handler if we exported it, 
            // or better, just tell the user to run pull. 
            // Actually, we can just run the pull logic if we extract it, but for now let's just 
            // instruct the user or try to run the pull command via a new process or just importing the action?
            // The pull command is an object. Let's just tell the user to run pull for now to keep it simple and robust.
            // Wait, the requirement says "clone variable from one of my project".
            // It's better if it auto-pulls.

            // Let's try to run the pull action.
            // Since pullCommand is a Command object, we can't easily call its action.
            // Let's just spawn a child process to run `dotveil pull`.

            const { execSync } = require('child_process');
            try {
                execSync('dotveil pull', { stdio: 'inherit' });
            } catch (e) {
                console.error(chalk.red('Failed to run pull automatically. Please run "dotveil pull" manually.'));
            }

        } catch (error: any) {
            spinner.fail('Failed to clone project');
            if (error.response?.status === 401) {
                console.error(chalk.red('Session expired. Please login again.'));
            } else {
                console.error(chalk.red(error.message));
            }
        }
    });
