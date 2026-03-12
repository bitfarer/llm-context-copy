import * as vscode from 'vscode';
import { ServiceTokens } from '../di/tokens';
import { CommandRegistrar } from './types';

let serviceContainer: import('../di/ServiceContainer').ServiceContainer | undefined;

export function setServiceContainer(container: import('../di/ServiceContainer').ServiceContainer): void {
  serviceContainer = container;
}

function tryGetService<T extends keyof import('../di/tokens').ServiceTypes>(token: T): import('../di/tokens').ServiceTypes[T] | undefined {
  if (!serviceContainer) {
    return undefined;
  }
  return serviceContainer.tryResolve(token);
}

export class PerformanceCommands implements CommandRegistrar {
  register(): vscode.Disposable[] {
    const commands: vscode.Disposable[] = [];

    commands.push(
      vscode.commands.registerCommand('llm-context-copy.switchTokenizer', async () => {
        const trueTokenizer = tryGetService(ServiceTokens.TrueTokenizer);
        if (!trueTokenizer) {
          vscode.window.showWarningMessage('Tokenizer not available.');
          return;
        }

        try {
          const { TrueTokenizer: TrueTokenizerClass } = await import('../performance/TrueTokenizer.js');
          const models = TrueTokenizerClass.getSupportedModels();
          
          interface ModelQuickPickItem extends vscode.QuickPickItem {
            modelName: string;
          }
          
          const selected = await vscode.window.showQuickPick<ModelQuickPickItem>(
            models.map((m: { name: string; tokenizer: string }) => ({
              label: m.name,
              description: `Tokenizer: ${m.tokenizer}`,
              modelName: m.name.toLowerCase().replace(/\s+/g, '-'),
            })),
            { placeHolder: 'Select AI model for accurate token counting' }
          );

          if (selected) {
            trueTokenizer.setModel(selected.modelName);
            vscode.window.showInformationMessage(`Switched to ${selected.label} tokenizer.`);
          }
        } catch (error) {
          vscode.window.showErrorMessage('Failed to switch tokenizer.');
        }
      }),

      vscode.commands.registerCommand('llm-context-copy.clearCache', async () => {
        const smartCache = tryGetService(ServiceTokens.SmartCache);
        if (!smartCache) {
          vscode.window.showWarningMessage('Cache not available.');
          return;
        }

        try {
          const size = smartCache.size();
          smartCache.clear();
          vscode.window.showInformationMessage(`Cleared ${size} cached items.`);
        } catch (error) {
          vscode.window.showErrorMessage('Failed to clear cache.');
        }
      })
    );

    return commands;
  }
}
