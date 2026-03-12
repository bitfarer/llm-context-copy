import * as vscode from 'vscode';
import { CommandRegistrar } from './types';
import { BasicCommands, setServiceContainer as setBasicCommandsServiceContainer } from './basicCommands';
import { WorkspaceCommands, setServiceContainer as setWorkspaceCommandsServiceContainer } from './workspaceCommands';
import { IntelligenceCommands, setServiceContainer as setIntelligenceCommandsServiceContainer } from './intelligenceCommands';
import { IntegrationCommands, setServiceContainer as setIntegrationCommandsServiceContainer } from './integrationCommands';
import { CollaborationCommands, setServiceContainer as setCollaborationCommandsServiceContainer } from './collaborationCommands';
import { PerformanceCommands, setServiceContainer as setPerformanceCommandsServiceContainer } from './performanceCommands';
import { StatsCommands, setServiceContainer as setStatsCommandsServiceContainer } from './statsCommands';

export { CommandRegistrar } from './types';

export function initializeCommands(serviceContainer: import('../di/ServiceContainer').ServiceContainer): void {
  setBasicCommandsServiceContainer(serviceContainer);
  setWorkspaceCommandsServiceContainer(serviceContainer);
  setIntelligenceCommandsServiceContainer(serviceContainer);
  setIntegrationCommandsServiceContainer(serviceContainer);
  setCollaborationCommandsServiceContainer(serviceContainer);
  setPerformanceCommandsServiceContainer(serviceContainer);
  setStatsCommandsServiceContainer(serviceContainer);
}

export const commandRegistrars: CommandRegistrar[] = [
  new BasicCommands(),
  new WorkspaceCommands(),
  new IntelligenceCommands(),
  new IntegrationCommands(),
  new CollaborationCommands(),
  new PerformanceCommands(),
  new StatsCommands(),
];

export function registerAllCommands(context: vscode.ExtensionContext): void {
  for (const registrar of commandRegistrars) {
    const disposables = registrar.register();
    if (Array.isArray(disposables)) {
      context.subscriptions.push(...disposables);
    } else {
      context.subscriptions.push(disposables);
    }
  }
}
