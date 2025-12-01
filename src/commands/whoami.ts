import { Command } from 'commander';
import chalk from 'chalk';
import figlet from 'figlet';
import fs from 'fs-extra';
import { ApiClient } from '../utils/ApiClient';
import { StorageManager } from '../utils/StorageManager';

export const whoamiCommand = new Command('whoami')
    .description('Display current session information')
    .action(async () => {
        const storage = new StorageManager();
        const apiClient = new ApiClient();

        // Print ASCII Art
        console.log(chalk.cyan(figlet.textSync('dotveil', { horizontalLayout: 'full' })));

        // Basic Info
        const apiUrl = process.env.DOTVEIL_API_URL || 'https://dotveil.com';
        console.log(chalk.bold('API URL: ') + chalk.blue(apiUrl));

        if (await storage.isLoggedIn()) {
            const token = await storage.getAccessToken();
            if (token) apiClient.setAccessToken(token);

            try {
                const user = await apiClient.getMe();
                console.log(chalk.bold('Email:   ') + chalk.green(user.email));
            } catch (error) {
                console.log(chalk.bold('Email:   ') + chalk.red('Failed to fetch user info'));
            }
        } else {
            console.log(chalk.bold('Email:   ') + chalk.yellow('Not logged in'));
        }

        // Project & Env from dotveil.json
        if (await fs.pathExists('dotveil.json')) {
            try {
                const config = await fs.readJSON('dotveil.json');
                console.log(chalk.bold('Project: ') + chalk.magenta(config.projectId)); // Ideally fetch name, but ID is what we have locally
                console.log(chalk.bold('Env:     ') + chalk.cyan(config.environment));
            } catch (error) {
                console.log(chalk.red('Error reading dotveil.json'));
            }
        } else {
            console.log(chalk.gray('No project context (dotveil.json not found)'));
        }

        console.log(''); // Empty line for spacing
    });
