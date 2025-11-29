import { Command } from 'commander';
import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import { KeyManager } from '../utils/KeyManager';
import { ApiClient } from '../utils/ApiClient';
import { StorageManager } from '../utils/StorageManager';

/**
 * Login Command
 * 
 * Handles two scenarios:
 * 1. First-time login (Computer A): Create master password, generate keypair, upload vault
 * 2. Existing user login (Computer B): Download vault, decrypt with master password
 */
export const loginCommand = new Command('login')
  .description('Authenticate with GitHub OAuth')
  .action(async () => {
    const keyManager = new KeyManager();
    const apiClient = new ApiClient();
    const storage = new StorageManager();

    // Check if already logged in
    const isLoggedIn = await storage.isLoggedIn();
    if (isLoggedIn) {
      console.log(chalk.yellow('⚠️  You are already logged in.'));
      const { confirm } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirm',
          message: 'Do you want to logout and login again?',
          default: false,
        },
      ]);

      if (!confirm) {
        return;
      }

      await storage.clearAll();
    }

    console.log(chalk.blue('🔐 DotVeil Login\n'));

    // Step 1: Initiate GitHub OAuth Device Flow
    const spinner = ora('Initiating GitHub OAuth...').start();

    let authResponse;
    try {
      authResponse = await apiClient.initiateAuth();
      spinner.succeed('GitHub OAuth initiated');
    } catch (error: any) {
      spinner.fail('Failed to initiate OAuth');
      console.error(chalk.red(error.message));
      return;
    }

    // Step 2: Show user code and open browser
    console.log(chalk.green('\n✅ Please complete authentication in your browser:'));
    console.log(chalk.cyan(`\n   ${authResponse.verificationUri}`));
    console.log(chalk.yellow(`\n   Device code: ${chalk.bold(authResponse.userCode)}\n`));

    // Open URL in browser (cross-platform)
    const open = (await import('open')).default;
    //await open(authResponse.verificationUri);

    // Step 3: Poll for authentication completion
    spinner.start('Waiting for authentication...');

    let tokenResponse;
    const maxAttempts = 60; // 5 minutes with 5 second intervals
    let attempts = 0;

    while (attempts < maxAttempts) {
      try {
        tokenResponse = await apiClient.pollAuth(authResponse.deviceCode);
        spinner.succeed('Authentication successful!');
        break;
      } catch (error: any) {
        if (error.response?.data?.error === 'authorization_pending') {
          await new Promise((resolve) => setTimeout(resolve, authResponse.interval * 1000));
          attempts++;
        } else {
          spinner.fail('Authentication failed');
          console.error(chalk.red(error.response?.data?.error || error.message));
          return;
        }
      }
    }

    if (!tokenResponse) {
      spinner.fail('Authentication timeout');
      console.error(chalk.red('Authentication timed out. Please try again.'));
      return;
    }

    // Store access token
    await storage.storeAccessToken(tokenResponse.accessToken);
    apiClient.setAccessToken(tokenResponse.accessToken);

    const user = tokenResponse.user;
    console.log(chalk.green(`\n✅ Logged in as ${chalk.bold(user.email)}\n`));

    // Step 4: Check if user has vault (existing user on new device vs first-time user)
    const hasVault = user.encryptedPrivateKey !== null;

    if (hasVault) {
      // Scenario: Existing user on new device
      await handleExistingUser(user, keyManager, storage);
    } else {
      // Scenario: First-time registration
      await handleNewUser(user, keyManager, apiClient, storage);
    }
  });

/**
 * Handle first-time user registration
 * Creates master password, generates keypair, uploads vault
 */
async function handleNewUser(
  user: any,
  keyManager: KeyManager,
  apiClient: ApiClient,
  storage: StorageManager
) {
  console.log(chalk.blue('🔑 First-time setup\n'));
  console.log(chalk.gray('You need to create a Master Password to encrypt your private key.'));
  console.log(chalk.gray('⚠️  This password is NEVER sent to the server and cannot be recovered.\n'));

  let masterPassword = '';

  while (true) {
    // Prompt for master password
    const { password } = await inquirer.prompt([
      {
        type: 'password',
        name: 'password',
        message: 'Create Master Password:',
        validate: (input: string) => {
          if (input.length < 12) {
            return 'Master password must be at least 12 characters';
          }
          return true;
        },
        mask: '*',
      },
    ]);

    const { confirm } = await inquirer.prompt([
      {
        type: 'password',
        name: 'confirm',
        message: 'Confirm Master Password:',
        mask: '*',
      },
    ]);

    if (password === confirm) {
      masterPassword = password;
      break;
    }

    console.error(chalk.red('\n❌ Passwords do not match. Please try again.\n'));

    const { retry } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'retry',
        message: 'Do you want to try again?',
        default: true,
      },
    ]);

    if (!retry) {
      console.log(chalk.yellow('Setup cancelled. Logging out...'));
      await storage.clearAll();
      process.exit(0);
    }
  }

  // Generate keypair
  const spinner = ora('Generating encryption keypair...').start();
  const { publicKey, privateKey } = await keyManager.generateKeyPair();
  spinner.succeed('Keypair generated');

  // Encrypt private key with master password
  spinner.start('Encrypting private key...');
  const { encrypted, salt, iv } = await keyManager.encryptPrivateKey(privateKey, masterPassword);
  spinner.succeed('Private key encrypted');

  // Upload vault to server
  spinner.start('Uploading vault to server...');
  try {
    await apiClient.updateVault({
      publicKey,
      encryptedPrivateKey: encrypted,
      salt,
      iv,
    });
    spinner.succeed('Vault uploaded successfully');
  } catch (error: any) {
    spinner.fail('Failed to upload vault');
    console.error(chalk.red(error.message));
    return;
  }

  // Store decrypted private key in system keychain
  await storage.storePrivateKey(privateKey);

  console.log(chalk.green('\n✅ Setup complete! You can now use DotVeil.\n'));
}

/**
 * Handle existing user on new device
 * Downloads vault, prompts for master password, decrypts private key
 */
async function handleExistingUser(
  user: any,
  keyManager: KeyManager,
  storage: StorageManager
) {
  console.log(chalk.blue('🔓 Restoring session on new device\n'));
  console.log(chalk.gray('Enter your Master Password to decrypt your private key.\n'));

  while (true) {
    // Prompt for master password
    const { masterPassword } = await inquirer.prompt([
      {
        type: 'password',
        name: 'masterPassword',
        message: 'Enter Master Password:',
        mask: '*',
      },
    ]);

    // Decrypt private key
    const spinner = ora('Decrypting private key...').start();

    try {
      const privateKey = await keyManager.decryptPrivateKey(
        user.encryptedPrivateKey!,
        masterPassword,
        user.salt!,
        user.iv!
      );

      spinner.succeed('Private key decrypted');

      // Store decrypted private key in system keychain
      await storage.storePrivateKey(privateKey);

      console.log(chalk.green('\n✅ Session restored! You can now use DotVeil.\n'));
      return;
    } catch (error: any) {
      spinner.fail('Failed to decrypt private key');
      console.error(chalk.red('\n❌ Incorrect master password.'));

      const { retry } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'retry',
          message: 'Do you want to try again?',
          default: true,
        },
      ]);

      if (!retry) {
        console.log(chalk.yellow('Login cancelled. Clearing session...'));
        await storage.clearAll();
        process.exit(0);
      }
    }
  }
}
