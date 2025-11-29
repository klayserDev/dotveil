import { Command } from 'commander';
import chalk from 'chalk';
import { StorageManager } from '../utils/StorageManager';

/**
 * Logout Command
 * Clears all local credentials from system keychain
 */
export const logoutCommand = new Command('logout')
  .description('Clear local credentials and logout')
  .action(async () => {
    const storage = new StorageManager();

    const isLoggedIn = await storage.isLoggedIn();
    if (!isLoggedIn) {
      console.log(chalk.yellow('⚠️  You are not logged in.'));
      return;
    }

    await storage.clearAll();
    console.log(chalk.green('✅ Logged out successfully.'));
  });
