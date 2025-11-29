import { Command } from 'commander';
import chalk from 'chalk';
import fs from 'fs-extra';
import ora from 'ora';
import { ApiClient } from '../utils/ApiClient';
import { StorageManager } from '../utils/StorageManager';
import { KeyManager } from '../utils/KeyManager';

export const memberCommand = new Command('member')
    .description('Manage project members');

memberCommand
    .command('invite <email>')
    .description('Invite a user to the project')
    .option('-r, --role <role>', 'Role (ADMIN/VIEWER)', 'VIEWER')
    .action(async (email, options) => {
        const apiClient = new ApiClient();
        const storage = new StorageManager();
        const keyManager = new KeyManager();

        // Check login status
        if (!(await storage.isLoggedIn())) {
            console.log(chalk.red('❌ You must be logged in.'));
            return;
        }

        const token = await storage.getAccessToken();
        if (token) apiClient.setAccessToken(token);

        if (!(await fs.pathExists('dotveil.json'))) {
            console.log(chalk.red('❌ dotveil.json not found.'));
            return;
        }

        const config = await fs.readJSON('dotveil.json');
        const projectId = config.projectId;
        const environment = config.environment || 'dev'; // We need env to get the key

        const spinner = ora(`Inviting ${email}...`).start();

        try {
            // 1. Lookup User
            spinner.text = 'Looking up user...';
            const userToAdd = await apiClient.lookupUser(email);

            if (!userToAdd.publicKey) {
                spinner.fail(`User ${email} has not set up their vault (no public key).`);
                return;
            }

            // 2. Get Project Key (we need to decrypt it first)
            spinner.text = 'Decrypting project key...';

            // We need to fetch the secrets to get the encryptedProjectKey for US
            // Optimization: We could have a separate endpoint just for the key, but reusing downloadSecrets is easier for now
            const { encryptedProjectKey } = await apiClient.downloadSecrets(projectId, environment);

            const privateKey = await storage.getPrivateKey();
            if (!privateKey) throw new Error('Private key not found');

            const projectKey = keyManager.decryptMessage(encryptedProjectKey, privateKey);

            // 3. Encrypt Project Key for New User
            spinner.text = 'Encrypting key for new user...';
            const encryptedKeyForNewUser = keyManager.encryptMessage(projectKey, userToAdd.publicKey);

            // 4. Invite Member
            spinner.text = 'Sending invitation...';
            await apiClient.inviteMember(projectId, email, options.role.toUpperCase(), encryptedKeyForNewUser);

            spinner.succeed(chalk.green(`Invited ${email} as ${options.role.toUpperCase()}!`));

        } catch (error: any) {
            spinner.fail('Failed to invite member');
            console.error(chalk.red(error.response?.data?.error || error.message));
        }
    });

memberCommand
    .command('remove <email>')
    .description('Remove a user from the project')
    .action(async (email) => {
        const apiClient = new ApiClient();
        const storage = new StorageManager();

        // Check login status
        if (!(await storage.isLoggedIn())) {
            console.log(chalk.red('❌ You must be logged in.'));
            return;
        }

        const token = await storage.getAccessToken();
        if (token) apiClient.setAccessToken(token);

        if (!(await fs.pathExists('dotveil.json'))) {
            console.log(chalk.red('❌ dotveil.json not found.'));
            return;
        }

        const config = await fs.readJSON('dotveil.json');
        const projectId = config.projectId;

        const spinner = ora(`Removing ${email}...`).start();

        try {
            await apiClient.removeMember(projectId, email);
            spinner.succeed(chalk.green(`Removed ${email} from project!`));
        } catch (error: any) {
            spinner.fail('Failed to remove member');
            console.error(chalk.red(error.response?.data?.error || error.message));
        }
    });

memberCommand
    .command('role <email> <role>')
    .description('Change a member\'s role (ADMIN/VIEWER)')
    .action(async (email, role) => {
        const apiClient = new ApiClient();
        const storage = new StorageManager();

        if (!(await storage.isLoggedIn())) {
            console.log(chalk.red('❌ You must be logged in.'));
            return;
        }

        const token = await storage.getAccessToken();
        if (token) apiClient.setAccessToken(token);

        if (!(await fs.pathExists('dotveil.json'))) {
            console.log(chalk.red('❌ dotveil.json not found.'));
            return;
        }

        const config = await fs.readJSON('dotveil.json');
        const projectId = config.projectId;

        const spinner = ora(`Updating role for ${email}...`).start();

        try {
            await apiClient.updateMemberRole(projectId, email, role.toUpperCase());
            spinner.succeed(chalk.green(`Updated ${email}'s role to ${role.toUpperCase()}!`));
        } catch (error: any) {
            spinner.fail('Failed to update role');
            console.error(chalk.red(error.response?.data?.error || error.message));
        }
    });

memberCommand
    .command('list')
    .description('List project members')
    .action(async () => {
        const apiClient = new ApiClient();
        const storage = new StorageManager();

        // Check login status
        if (!(await storage.isLoggedIn())) {
            console.log(chalk.red('❌ You must be logged in.'));
            return;
        }

        const token = await storage.getAccessToken();
        if (token) apiClient.setAccessToken(token);

        if (!(await fs.pathExists('dotveil.json'))) {
            console.log(chalk.red('❌ dotveil.json not found.'));
            return;
        }

        const config = await fs.readJSON('dotveil.json');
        const projectId = config.projectId;

        const spinner = ora('Fetching members...').start();

        try {
            const members = await apiClient.listMembers(projectId);
            spinner.stop();

            if (members.length === 0) {
                console.log(chalk.yellow('No members found.'));
                return;
            }

            console.log(chalk.bold(`\n📋 Project Members (${members.length}):\n`));

            // Create table
            const Table = require('cli-table3');
            const table = new Table({
                head: [chalk.cyan('Email'), chalk.cyan('Role'), chalk.cyan('Joined')],
                colWidths: [40, 15, 25],
                style: {
                    head: [],
                    border: ['gray']
                }
            });

            members.forEach((member: any) => {
                const roleColor = member.role === 'OWNER' ? chalk.magenta :
                    member.role === 'ADMIN' ? chalk.blue : chalk.gray;
                table.push([
                    member.email,
                    roleColor(member.role),
                    new Date(member.joinedAt).toLocaleString()
                ]);
            });

            console.log(table.toString());
            console.log('');

        } catch (error: any) {
            spinner.fail('Failed to list members');
            console.error(chalk.red(error.response?.data?.error || error.message));
        }
    });

memberCommand
    .command('invitations')
    .description('List your pending invitations')
    .action(async () => {
        const apiClient = new ApiClient();
        const storage = new StorageManager();

        if (!(await storage.isLoggedIn())) {
            console.log(chalk.red('❌ You must be logged in.'));
            return;
        }

        const token = await storage.getAccessToken();
        if (token) apiClient.setAccessToken(token);

        const spinner = ora('Fetching invitations...').start();

        try {
            const invitations = await apiClient.listMyInvitations();
            spinner.stop();

            if (invitations.length === 0) {
                console.log(chalk.yellow('No pending invitations found.'));
                return;
            }

            console.log(chalk.bold(`\n📨 Pending Invitations (${invitations.length}):\n`));

            const Table = require('cli-table3');
            const table = new Table({
                head: [chalk.cyan('Project'), chalk.cyan('Invited By'), chalk.cyan('Role'), chalk.cyan('Token')],
                colWidths: [20, 30, 15, 40],
                style: { head: [], border: ['gray'] }
            });

            invitations.forEach((invitation: any) => {
                table.push([
                    invitation.project.name,
                    invitation.inviter.email,
                    invitation.role,
                    invitation.token
                ]);
            });

            console.log(table.toString());
            console.log(chalk.gray('\nTo accept an invitation, run:'));
            console.log(chalk.cyan('  dotveil member accept-invite <token>'));
            console.log('');

        } catch (error: any) {
            spinner.fail('Failed to list invitations');
            console.error(chalk.red(error.response?.data?.error || error.message));
        }
    });

memberCommand
    .command('accept-invite <token>')
    .description('Accept a project invitation')
    .action(async (token) => {
        const apiClient = new ApiClient();
        const storage = new StorageManager();

        if (!(await storage.isLoggedIn())) {
            console.log(chalk.red('❌ You must be logged in.'));
            return;
        }

        const tokenAuth = await storage.getAccessToken();
        if (tokenAuth) apiClient.setAccessToken(tokenAuth);

        const spinner = ora('Accepting invitation...').start();

        try {
            await apiClient.acceptInvitation(token);
            spinner.succeed(chalk.green('✅ Invitation accepted! You can now access the project.'));
        } catch (error: any) {
            spinner.fail('Failed to accept invitation');
            console.error(chalk.red(error.response?.data?.error || error.message));
        }
    });

memberCommand
    .command('decline-invite <token>')
    .description('Decline a project invitation')
    .action(async (token) => {
        const apiClient = new ApiClient();
        const storage = new StorageManager();

        if (!(await storage.isLoggedIn())) {
            console.log(chalk.red('❌ You must be logged in.'));
            return;
        }

        const tokenAuth = await storage.getAccessToken();
        if (tokenAuth) apiClient.setAccessToken(tokenAuth);

        const spinner = ora('Declining invitation...').start();

        try {
            await apiClient.declineInvitation(token);
            spinner.succeed(chalk.green('Invitation declined.'));
        } catch (error: any) {
            spinner.fail('Failed to decline invitation');
            console.error(chalk.red(error.response?.data?.error || error.message));
        }
    });
