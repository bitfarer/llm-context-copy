import * as vscode from 'vscode';
import { ServiceTokens } from '../di/tokens';
import { CommandRegistrar } from './types';

let serviceContainer: import('../di/ServiceContainer').ServiceContainer | undefined;

export function setServiceContainer(container: import('../di/ServiceContainer').ServiceContainer): void {
  serviceContainer = container;
}

export class IntegrationCommands implements CommandRegistrar {
  register(): vscode.Disposable[] {
    const commands: vscode.Disposable[] = [];

    commands.push(
      vscode.commands.registerCommand('llm-context-copy.sendToLLM', async () => {
        vscode.window.showWarningMessage('LLM integration not available.');
      }),

      vscode.commands.registerCommand('llm-context-copy.exportToFile', async () => {
        vscode.window.showWarningMessage('Export service not available.');
      }),

      vscode.commands.registerCommand('llm-context-copy.selectFromGit', async () => {
        vscode.window.showWarningMessage('Git integration not available.');
      }),

      vscode.commands.registerCommand('llm-context-copy.selectPromptTemplate', async () => {
        vscode.window.showWarningMessage('Prompt template manager not available.');
      })
    );

    return commands;
  }
}
