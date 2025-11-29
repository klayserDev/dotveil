#!/usr/bin/env node

import { Command } from 'commander';
import { loginCommand } from './commands/login';
import { logoutCommand } from './commands/logout';
import { initCommand } from './commands/init';
import { pushCommand } from './commands/push';
import { pullCommand } from './commands/pull';
import { envCommand } from './commands/env';
import { memberCommand } from './commands/member';
import { listCommand } from './commands/list';
import { cloneCommand } from './commands/clone';
import { dashboardCommand } from './commands/dashboard';
import { keysCommand } from './commands/keys';
import { deleteCommand } from './commands/delete';

import { rollbackCommand } from './commands/rollback';
import { switchCommand } from './commands/switch';

const program = new Command();

program
  .name('dotveil')
  .description('Zero-Knowledge .env file sync CLI')
  .version('1.0.0');

// Register commands
program.addCommand(loginCommand);
program.addCommand(logoutCommand);
program.addCommand(initCommand);
program.addCommand(pushCommand);
program.addCommand(pullCommand);
program.addCommand(envCommand);
program.addCommand(memberCommand);
program.addCommand(listCommand);
program.addCommand(cloneCommand);
program.addCommand(dashboardCommand);
program.addCommand(keysCommand);
program.addCommand(deleteCommand);
program.addCommand(rollbackCommand);
program.addCommand(switchCommand);

program.parse(process.argv);
