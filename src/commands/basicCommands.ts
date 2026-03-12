import * as vscode from 'vscode';
import { ServiceTokens } from '../di/tokens';
import { CommandRegistrar } from './types';

let serviceContainer: import('../di/ServiceContainer').ServiceContainer | undefined;

export function setServiceContainer(container: import('../di/ServiceContainer').ServiceContainer): void {
  serviceContainer = container;
}

function getService<T extends keyof import('../di/tokens').ServiceTypes>(token: T): import('../di/tokens').ServiceTypes[T] {
  if (!serviceContainer) {
    throw new Error('Service container not initialized. Call setServiceContainer first.');
  }
  return serviceContainer.resolve(token);
}

export class BasicCommands implements CommandRegistrar {
  register(): vscode.Disposable[] {
    const treeViewProvider = getService(ServiceTokens.TreeViewProvider);
    const contextManager = getService(ServiceTokens.ContextManager);

    return [
      vscode.commands.registerCommand('llm-context-copy.toggleItem', (item) => {
        treeViewProvider.toggleItem(item.id);
      }),

      vscode.commands.registerCommand('llm-context-copy.copySelected', async () => {
        await treeViewProvider.copySelectedItems();
      }),

      vscode.commands.registerCommand('llm-context-copy.copyIncremental', async () => {
        await treeViewProvider.copyIncremental();
      }),

      vscode.commands.registerCommand('llm-context-copy.showPreview', async () => {
        await treeViewProvider.showPreview();
      }),

      vscode.commands.registerCommand('llm-context-copy.applyTokenBudget', async () => {
        await treeViewProvider.applyTokenBudget();
      }),

      vscode.commands.registerCommand('llm-context-copy.selectAll', async () => {
        await treeViewProvider.selectAll();
      }),

      vscode.commands.registerCommand('llm-context-copy.deselectAll', () => {
        treeViewProvider.deselectAll();
      }),

      vscode.commands.registerCommand('llm-context-copy.refresh', () => {
        contextManager.refresh();
      }),

      vscode.commands.registerCommand('llm-context-copy.openSettings', async () => {
        await treeViewProvider.showSettings();
      }),

      vscode.commands.registerCommand('llm-context-copy.openFileTree', () => {
        vscode.commands.executeCommand('llm-context-copy.tree.focus');
      }),
    ];
  }
}
