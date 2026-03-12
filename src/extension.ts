import * as vscode from 'vscode';
import * as path from 'path';

import { ServiceContainer } from './di/ServiceContainer';
import { ServiceTokens } from './di/tokens';
import { registerServices, initializeLazyServices } from './di/serviceRegistration';
import { ILogger } from './infrastructure/Logger';
import { initializeCommands, registerAllCommands } from './commands';
import { TOKEN_ESTIMATION } from './commands/constants';

let serviceContainer: ServiceContainer;
let logger: ILogger;
let statusBarItem: vscode.StatusBarItem;

function getService<T extends keyof import('./di/tokens').ServiceTypes>(token: T): import('./di/tokens').ServiceTypes[T] {
  return serviceContainer.resolve(token);
}

function tryGetService<T extends keyof import('./di/tokens').ServiceTypes>(token: T): import('./di/tokens').ServiceTypes[T] | undefined {
  return serviceContainer.tryResolve(token);
}

function formatTokenCount(tokens: number): string {
  if (tokens >= 1000000) {
    return `${(tokens / 1000000).toFixed(1)}M`;
  }
  if (tokens >= 1000) {
    return `${(tokens / 1000).toFixed(1)}K`;
  }
  return `${tokens}`;
}

function updateStatusBar(stats: { selectedFiles: number; rawTokens: number; compressedTokens: number }): void {
  if (!statusBarItem) { return; }
  
  if (stats.selectedFiles === 0) {
    statusBarItem.text = '$(clippy) LLM Context';
    statusBarItem.tooltip = 'Click to copy selected files (no files selected)';
  } else {
    const tokenText = formatTokenCount(stats.rawTokens);
    statusBarItem.text = `$(clippy) ${stats.selectedFiles} files | ${tokenText} tokens`;
    
    if (stats.compressedTokens !== stats.rawTokens) {
      const savings = stats.rawTokens - stats.compressedTokens;
      const savingsPercent = ((savings / stats.rawTokens) * 100).toFixed(1);
      statusBarItem.tooltip = `Click to copy selected files\n${stats.selectedFiles} files selected\n${stats.rawTokens.toLocaleString()} tokens (raw)\n${stats.compressedTokens.toLocaleString()} tokens (after compression)\nSaved: ${savings.toLocaleString()} tokens (${savingsPercent}%)`;
    } else {
      statusBarItem.tooltip = `Click to copy selected files\n${stats.selectedFiles} files selected\n${stats.rawTokens.toLocaleString()} tokens`;
    }
  }
}

export function activate(context: vscode.ExtensionContext) {
  serviceContainer = new ServiceContainer();
  registerServices(serviceContainer, context);
  
  logger = getService(ServiceTokens.Logger);
  logger.info('LLM Context Copy is now active!');

  initializeLazyServices(serviceContainer);

  initializeCommands(serviceContainer);

  const contextManager = getService(ServiceTokens.ContextManager);
  const treeViewProvider = getService(ServiceTokens.TreeViewProvider);
  const statsViewProvider = getService(ServiceTokens.StatsViewProvider);

  const treeView = vscode.window.createTreeView('llm-context-copy.tree', {
    treeDataProvider: treeViewProvider,
    showCollapseAll: true,
    canSelectMany: false,
    manageCheckboxStateManually: true,
  });

  const statsView = vscode.window.createTreeView('llm-context-copy.stats', {
    treeDataProvider: statsViewProvider,
  });

  context.subscriptions.push(
    treeView,
    statsView,
    treeView.onDidChangeCheckboxState(async (e) => {
      for (const [item, state] of e.items) {
        if (state === vscode.TreeItemCheckboxState.Checked) {
          await treeViewProvider.checkItem(item.id);
        } else {
          await treeViewProvider.uncheckItem(item.id);
        }
      }
    }),
    treeViewProvider.onDidChangeSelection(async (selection) => {
      const activeStrategies = Array.from(contextManager.getActiveStrategies());
      const outputFormat = contextManager.getOutputFormat() ?? 'markdown';

      statsViewProvider.refresh({
        selectedFiles: selection.files,
        totalSize: selection.size,
        estimatedTokens: selection.compressedTokens,
        activeStrategies,
        outputFormat,
      });

      updateStatusBar({
        selectedFiles: selection.files,
        rawTokens: selection.rawTokens,
        compressedTokens: selection.compressedTokens,
      });
    })
  );

  statsViewProvider.onDidChangeStats((stats) => {
    updateStatusBar({
      selectedFiles: stats.selectedFiles,
      rawTokens: stats.estimatedTokens,
      compressedTokens: stats.estimatedTokens,
    });
  });

  registerAllCommands(context);

  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusBarItem.text = '$(clippy) LLM Context';
  statusBarItem.tooltip = 'Click to copy selected files';
  statusBarItem.command = 'llm-context-copy.copySelected';
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  logger.info('LLM Context Copy activation completed');
}

export function deactivate() {
  logger?.info('LLM Context Copy is deactivating...');
  
  try {
    const fileWatcher = tryGetService(ServiceTokens.FileWatcherService);
    fileWatcher?.dispose();

    const smartCache = tryGetService(ServiceTokens.SmartCache);
    smartCache?.clear();

    serviceContainer?.clear();
    
    logger?.info('LLM Context Copy deactivated successfully');
  } catch (error) {
    console.error('Error during deactivation:', error);
  }
}
