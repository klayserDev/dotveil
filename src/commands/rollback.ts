import { Command } from 'commander';
import { ApiClient } from '../utils/ApiClient';
import { StorageManager } from '../utils/StorageManager';
import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import fs from 'fs-extra';

export const rollbackCommand = new Command('rollback');

rollbackCommand
  .description('Rollback secrets to a previous version')
  .option('-p, --project <project>', 'Project name')
  .option('-e, --env <environment>', 'Environment name')
  .action(async (options) => {
    const apiClient = new ApiClient();
    const storage = new StorageManager();

    // Check login status
    if (!(await storage.isLoggedIn())) {
        console.log(chalk.red('❌ You must be logged in to rollback secrets.'));
        console.log('Run ' + chalk.cyan('dotveil login') + ' first.');
        return;
    }

    // Set access token
    const token = await storage.getAccessToken();
    if (token) apiClient.setAccessToken(token);

    try {
      // 1. Get Project
      let projectId: string | undefined;
      
      if (await fs.pathExists('dotveil.json')) {
        const config = await fs.readJSON('dotveil.json');
        projectId = config.projectId;
      }

      if (options.project) {
         // If project name is provided, we would need to resolve it.
         // For now, let's assume if they provide a project name, they might mean ID or we need to search.
         // But to match push/pull, we usually rely on dotveil.json or interactive list.
         // Let's stick to interactive if not in dotveil.json
      }

      if (!projectId) {
        const projects = await apiClient.listProjects();
        if (projects.length === 0) {
          console.log(chalk.yellow('No projects found.'));
          return;
        }
        const { selectedProject } = await inquirer.prompt([
          {
            type: 'list',
            name: 'selectedProject',
            message: 'Select a project:',
            choices: projects.map((p: any) => ({ name: p.name, value: p.id })),
          },
        ]);
        projectId = selectedProject;
      }

      if (!projectId) {
          console.log(chalk.red('Project ID is required.'));
          return;
      }

      // 2. Get Environment
      let environment = options.env;
      if (!environment) {
        // Try to get from config
        if (await fs.pathExists('dotveil.json')) {
            const config = await fs.readJSON('dotveil.json');
            environment = config.environment;
        }
      }

      if (!environment) {
        const { selectedEnv } = await inquirer.prompt([
          {
            type: 'list',
            name: 'selectedEnv',
            message: 'Select environment:',
            choices: ['development', 'preview', 'production'],
          },
        ]);
        environment = selectedEnv;
      }

      // 3. Fetch Versions
      const spinner = ora('Fetching secret versions...').start();
      const versions = await apiClient.getSecretVersions(projectId, environment);
      spinner.stop();

      if (versions.length === 0) {
        console.log(chalk.yellow('No version history found for this environment.'));
        return;
      }

      // 4. Select Version
      const { versionId } = await inquirer.prompt([
        {
          type: 'list',
          name: 'versionId',
          message: 'Select a version to rollback to:',
          choices: versions.map((v: any) => ({
            name: `v${v.version} - ${new Date(v.createdAt).toLocaleString()} by ${v.createdBy}`,
            value: v.id,
          })),
        },
      ]);

      // 5. Confirm
      const { confirm } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirm',
          message: chalk.red('Are you sure? This will overwrite the current secrets.'),
          default: false,
        },
      ]);

      if (!confirm) {
        console.log('Rollback cancelled.');
        return;
      }

      // 6. Perform Rollback
      const rollbackSpinner = ora('Rolling back secrets...').start();
      await apiClient.rollbackSecret(projectId, environment, versionId);
      rollbackSpinner.succeed('Secrets rolled back successfully.');

      // 7. Offer to Pull
      const { shouldPull } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'shouldPull',
          message: 'Do you want to pull the rolled-back secrets to your local .env file?',
          default: true,
        },
      ]);

      if (shouldPull) {
        console.log(chalk.green(`\nRun 'dotveil pull -e ${environment}' to update your local file.`));
      }

    } catch (error: any) {
      console.error(chalk.red('Error:'), error.message || error);
    }
  });
