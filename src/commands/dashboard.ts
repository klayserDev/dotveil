import { Command } from 'commander';
import chalk from 'chalk';
/**
 * Dashboard Command
 * Opens the DotVeil dashboard in the default browser
 */
export const dashboardCommand = new Command('dashboard')
    .description('Open the DotVeil dashboard in your browser')
    .action(async () => {
        const apiUrl = process.env.DOTVEIL_API_URL || 'http://localhost:3000';
        let dashboardUrl = process.env.DOTVEIL_DASHBOARD_URL;

        if (!dashboardUrl) {
            if (apiUrl.includes('localhost')) {
                dashboardUrl = 'http://localhost:3000/dashboard';
            } else {
                dashboardUrl = 'https://dotveil.com/dashboard';
            }
        }

        console.log(chalk.blue(`Opening dashboard at ${dashboardUrl}...`));
        const open = (await import('open')).default;
        await open(dashboardUrl);
        console.log(chalk.green('✅ Dashboard opened successfully!'));
        await new Promise(resolve => setTimeout(resolve, 2000));
    });
