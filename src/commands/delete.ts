import { Command } from 'commander';
import { ApiClient } from '../utils/ApiClient';
import { StorageManager } from '../utils/StorageManager';
import chalk from 'chalk';
import inquirer from 'inquirer';

export const deleteCommand = new Command('delete')
    .description('Delete a project')
    .argument('[project-name]', 'Name of the project to delete')
    .action(async (projectName) => {
        try {
            const apiClient = new ApiClient();
            const storage = new StorageManager();

            if (!(await storage.isLoggedIn())) {
                console.log(chalk.red('❌ You must be logged in to delete a project.'));
                console.log('Run ' + chalk.cyan('dotveil login') + ' first.');
                return;
            }

            const token = await storage.getAccessToken();
            if (token) apiClient.setAccessToken(token);

            // Resolve project name to ID
            const projects = await apiClient.listProjects();
            const project = projects.find((p: any) => p.name === projectName);

            if (!project) {
                console.log(chalk.red(`❌ Project '${projectName}' not found.`));
                return;
            }

            // Confirm deletion by typing name
            const { confirmName } = await inquirer.prompt([
                {
                    type: 'input',
                    name: 'confirmName',
                    message: `To confirm, type the project name (${chalk.bold(projectName)}):`,
                }
            ]);

            if (confirmName !== projectName) {
                console.log(chalk.yellow('❌ Project name mismatch. Deletion cancelled.'));
                return;
            }

            await apiClient.deleteProject(project.id);
            console.log(chalk.green(`✅ Project ${projectName} deleted successfully.`));

        } catch (error: any) {
            console.error(chalk.red('Error deleting project:'), error.response?.data?.error || error.message);
            process.exit(1);
        }
    });
