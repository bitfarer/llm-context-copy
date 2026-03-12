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

function tryGetService<T extends keyof import('../di/tokens').ServiceTypes>(token: T): import('../di/tokens').ServiceTypes[T] | undefined {
  if (!serviceContainer) {
    return undefined;
  }
  return serviceContainer.tryResolve(token);
}

export class WorkspaceCommands implements CommandRegistrar {
  register(): vscode.Disposable {
    return vscode.commands.registerCommand('llm-context-copy.switchWorkspace', async () => {
      const workspaceManager = tryGetService(ServiceTokens.WorkspaceManager);
      if (!workspaceManager) {
        vscode.window.showWarningMessage('Workspace manager not available.');
        return;
      }
      
      const workspaces = workspaceManager.getWorkspaces();
      if (workspaces.length <= 1) {
        vscode.window.showInformationMessage('Only one workspace folder open.');
        return;
      }

      const selected = await vscode.window.showQuickPick(
        workspaces.map(ws => ({
          label: ws.isActive ? `✓ ${ws.name}` : ws.name,
          description: ws.rootPath,
          workspaceId: ws.id,
        })),
        { placeHolder: 'Select workspace' }
      );

      if (selected) {
        await workspaceManager.setActiveWorkspace(selected.workspaceId);
        const contextManager = getService(ServiceTokens.ContextManager);
        contextManager.refresh();
        vscode.window.showInformationMessage(`Switched to workspace: ${selected.label}`);
      }
    });
  }
}
