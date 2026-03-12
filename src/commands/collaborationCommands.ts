import * as vscode from 'vscode';
import { ServiceTokens } from '../di/tokens';
import { CommandRegistrar } from './types';

let serviceContainer: import('../di/ServiceContainer').ServiceContainer | undefined;

export function setServiceContainer(container: import('../di/ServiceContainer').ServiceContainer): void {
  serviceContainer = container;
}

export class CollaborationCommands implements CommandRegistrar {
  register(): vscode.Disposable[] {
    const commands: vscode.Disposable[] = [];

    commands.push(
      vscode.commands.registerCommand('llm-context-copy.createProfile', async () => {
        vscode.window.showWarningMessage('Profile manager not available.');
      }),

      vscode.commands.registerCommand('llm-context-copy.applyProfile', async () => {
        vscode.window.showWarningMessage('Profile manager not available.');
      }),

      vscode.commands.registerCommand('llm-context-copy.showUsageStats', async () => {
        vscode.window.showWarningMessage('Usage analytics not available.');
      }),

      vscode.commands.registerCommand('llm-context-copy.exportUsageReport', async () => {
        vscode.window.showWarningMessage('Usage analytics not available.');
      }),

      vscode.commands.registerCommand('llm-context-copy.loadTeamConfig', async () => {
        vscode.window.showWarningMessage('Config manager not available.');
      })
    );

    return commands;
  }
}
