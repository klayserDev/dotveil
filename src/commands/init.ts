import { Command } from 'commander';
import inquirer from 'inquirer';
import chalk from 'chalk';
import fs from 'fs-extra';
import path from 'path';
import { ApiClient } from '../utils/ApiClient';
import { StorageManager } from '../utils/StorageManager';
import ora from 'ora';

export const initCommand = new Command('init')
    .description('Initialize a new project')
    .action(async () => {
        const apiClient = new ApiClient();
        const storage = new StorageManager();

        // Check login status
        if (!(await storage.isLoggedIn())) {
            console.log(chalk.red('❌ You must be logged in to initialize a project.'));
            console.log('Run ' + chalk.cyan('dotveil login') + ' first.');
            return;
        }

        // Set access token
        const token = await storage.getAccessToken();
        if (token) apiClient.setAccessToken(token);

        console.log(chalk.blue('🚀 Initialize new DotVeil project\n'));

        // Check if already initialized
        if (await fs.pathExists('dotveil.json')) {
            console.log(chalk.yellow('⚠️  dotveil.json already exists.'));
            const { overwrite } = await inquirer.prompt([
                {
                    type: 'confirm',
                    name: 'overwrite',
                    message: 'Do you want to overwrite it?',
                    default: false,
                },
            ]);

            if (!overwrite) {
                console.log('Aborted.');
                return;
            }
        }

        // Prompt for project name
        const { projectName } = await inquirer.prompt([
            {
                type: 'input',
                name: 'projectName',
                message: 'Project name:',
                default: path.basename(process.cwd()),
                validate: (input: string) => {
                    if (input.length < 3) return 'Project name must be at least 3 characters';
                    return true;
                },
            },
        ]);

        const spinner = ora('Creating project...').start();

        try {
            // Create project on backend
            const project = await apiClient.createProject(projectName);
            spinner.succeed(`Project "${projectName}" created!`);

            // Create default 'dev' environment
            spinner.start('Creating default "dev" environment...');
            try {
                await apiClient.createEnvironment(project.id, 'dev');
                spinner.succeed('Default "dev" environment created!');
            } catch (e) {
                // If it fails, it might already exist (unlikely for new project) or some other error.
                // We'll just log a warning but proceed, as the user can create it later.
                spinner.warn('Could not create default "dev" environment.');
            }

            // Create dotveil.json
            const config = {
                projectId: project.id,
                name: project.name,
                environment: 'dev' // Default environment
            };

            await fs.writeJSON('dotveil.json', config, { spaces: 2 });
            console.log(chalk.green('✅ Created dotveil.json'));

            // Check .env
            if (!(await fs.pathExists('.env'))) {
                await fs.writeFile('.env', '# Secrets managed by DotVeil\n');
                console.log(chalk.green('✅ Created .env file'));
            }

            // Check .gitignore
            if (await fs.pathExists('.gitignore')) {
                const gitignore = await fs.readFile('.gitignore', 'utf8');
                if (!gitignore.includes('.env')) {
                    await fs.appendFile('.gitignore', '\n.env');
                    spinner.succeed('Added .env to .gitignore');
                }
                if (!gitignore.includes('dotveil.json')) {
                    await fs.appendFile('.gitignore', '\ndotveil.json');
                    spinner.succeed('Added dotveil.json to .gitignore');
                }
            } else {
                await fs.writeFile('.gitignore', '.env\ndotveil.json');
                spinner.succeed('Created .gitignore with .env');
            }

            console.log(chalk.green('\n🎉 Project initialized successfully!'));
            console.log('Run ' + chalk.cyan('dotveil push') + ' to encrypt and push your secrets.');

        } catch (error: any) {
            spinner.fail('Failed to create project');
            console.error(chalk.red(error.response?.data?.error || error.message));
        }
    });
