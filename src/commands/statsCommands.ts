import * as vscode from 'vscode';
import { ServiceTokens } from '../di/tokens';
import { CommandRegistrar } from './types';
import { OutputFormat, isValidOutputFormat } from './constants';

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

export class StatsCommands implements CommandRegistrar {
  private statsViewProviderClass: typeof import('../tree/StatsViewProvider.js').StatsViewProvider | undefined;
  private logger: import('../infrastructure/Logger').ILogger | undefined;

  async ensureDependencies(): Promise<void> {
    if (!this.statsViewProviderClass) {
      const module = await import('../tree/StatsViewProvider.js');
      this.statsViewProviderClass = module.StatsViewProvider;
      this.logger = getService(ServiceTokens.Logger);
    }
  }

  register(): vscode.Disposable[] {
    const commands: vscode.Disposable[] = [];

    commands.push(
      vscode.commands.registerCommand('llm-context-copy.stats.format', async () => {
        const contextManager = getService(ServiceTokens.ContextManager);
        const statsViewProvider = getService(ServiceTokens.StatsViewProvider);

        await this.ensureDependencies();

        try {
          const formatOptions = this.statsViewProviderClass!.getFormatOptions();
          const currentFormat = contextManager.getOutputFormat();

          interface FormatQuickPickItem extends vscode.QuickPickItem {
            formatId: string;
          }

          const selected = await vscode.window.showQuickPick<FormatQuickPickItem>(
            formatOptions.map((f: { displayName: string; description: string; id: string }) => ({
              label: f.displayName,
              description: f.description,
              detail: f.id === currentFormat ? '✓ Current' : '',
              formatId: f.id,
            })),
            {
              placeHolder: 'Select output format',
              matchOnDescription: true,
            }
          );

          if (selected && selected.formatId !== currentFormat && isValidOutputFormat(selected.formatId)) {
            await contextManager.setOutputFormat(selected.formatId as OutputFormat);
            const stats = statsViewProvider.getStats();
            statsViewProvider.refresh({
              ...stats,
              outputFormat: selected.formatId,
            });
            vscode.window.showInformationMessage(`Output format changed to ${selected.label}`);
          }
        } catch (error) {
          this.logger!.error('Failed to change output format:', error as Error);
          vscode.window.showErrorMessage('Failed to change output format.');
        }
      }),

      vscode.commands.registerCommand('llm-context-copy.stats.strategies', async () => {
        const contextManager = getService(ServiceTokens.ContextManager);
        const statsViewProvider = getService(ServiceTokens.StatsViewProvider);

        await this.ensureDependencies();

        try {
          const strategyOptions = this.statsViewProviderClass!.getStrategyOptions();
          const activeStrategies = contextManager.getActiveStrategies();

          interface StrategyQuickPickItem extends vscode.QuickPickItem {
            strategyId: string;
          }

          const selected = await vscode.window.showQuickPick<StrategyQuickPickItem>(
            strategyOptions.map((s: { displayName: string; description: string; id: string }) => ({
              label: s.displayName,
              description: s.description,
              picked: activeStrategies.has(s.id),
              strategyId: s.id,
            })),
            {
              canPickMany: true,
              placeHolder: 'Select compression strategies',
              matchOnDescription: true,
            }
          );

          if (selected) {
            const strategyIds = selected.map(s => s.strategyId);
            await contextManager.setActiveStrategies(strategyIds);
            const stats = statsViewProvider.getStats();
            statsViewProvider.refresh({
              ...stats,
              activeStrategies: strategyIds,
            });
            vscode.window.showInformationMessage(`${strategyIds.length} compression ${strategyIds.length === 1 ? 'strategy' : 'strategies'} active`);
          }
        } catch (error) {
          this.logger!.error('Failed to update strategies:', error as Error);
          vscode.window.showErrorMessage('Failed to update compression strategies.');
        }
      }),

      vscode.commands.registerCommand('llm-context-copy.stats.toggleStrategy', async (strategyId: unknown) => {
        const contextManager = getService(ServiceTokens.ContextManager);
        const statsViewProvider = getService(ServiceTokens.StatsViewProvider);
        const logger = getService(ServiceTokens.Logger);

        if (typeof strategyId !== 'string' || !strategyId) {
          vscode.window.showWarningMessage('Invalid strategy ID provided.');
          return;
        }

        try {
          await contextManager.toggleStrategy(strategyId);
          const activeStrategies = Array.from(contextManager.getActiveStrategies());
          const stats = statsViewProvider.getStats();
          statsViewProvider.refresh({
            ...stats,
            activeStrategies,
          });

          await this.ensureDependencies();

          const strategyOptions = this.statsViewProviderClass!.getStrategyOptions();
          const strategy = strategyOptions.find((s: { id: string }) => s.id === strategyId);
          const isActive = activeStrategies.includes(strategyId);
          vscode.window.showInformationMessage(`${strategy?.displayName || strategyId} ${isActive ? 'enabled' : 'disabled'}`);
        } catch (error) {
          logger.error('Failed to toggle strategy:', error as Error);
          vscode.window.showErrorMessage('Failed to toggle strategy.');
        }
      }),

      vscode.commands.registerCommand('llm-context-copy.stats.setFormat', async (formatId: unknown) => {
        const contextManager = getService(ServiceTokens.ContextManager);
        const statsViewProvider = getService(ServiceTokens.StatsViewProvider);
        const logger = getService(ServiceTokens.Logger);

        if (!isValidOutputFormat(formatId)) {
          vscode.window.showWarningMessage('Invalid format ID provided.');
          return;
        }

        try {
          const currentFormat = contextManager.getOutputFormat();
          if (formatId === currentFormat) {
            return;
          }

          await contextManager.setOutputFormat(formatId as OutputFormat);
          const stats = statsViewProvider.getStats();
          statsViewProvider.refresh({
            ...stats,
            outputFormat: formatId,
          });

          await this.ensureDependencies();

          const formatOptions = this.statsViewProviderClass!.getFormatOptions();
          const format = formatOptions.find((f: { id: string }) => f.id === formatId);
          vscode.window.showInformationMessage(`Output format changed to ${format?.displayName || formatId}`);
        } catch (error) {
          logger.error('Failed to set output format:', error as Error);
          vscode.window.showErrorMessage('Failed to set output format.');
        }
      })
    );

    return commands;
  }
}
