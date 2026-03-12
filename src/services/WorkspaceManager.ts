import * as vscode from 'vscode';
import { WorkspaceInfo } from '../types';

export interface IWorkspaceManager {
  getWorkspaces(): WorkspaceInfo[];
  getActiveWorkspace(): WorkspaceInfo | undefined;
  setActiveWorkspace(workspaceId: string): void;
  onDidChangeWorkspaces: vscode.Event<WorkspaceInfo[]>;
}

export class WorkspaceManager implements IWorkspaceManager {
  private _onDidChangeWorkspaces = new vscode.EventEmitter<WorkspaceInfo[]>();
  readonly onDidChangeWorkspaces = this._onDidChangeWorkspaces.event;

  private activeWorkspaceId: string = '';
  private workspaceCache: Map<string, WorkspaceInfo> = new Map();

  constructor(private extensionContext: vscode.ExtensionContext) {
    this.loadSavedWorkspace();
    
    extensionContext.subscriptions.push(
      vscode.workspace.onDidChangeWorkspaceFolders(() => {
        this.refreshWorkspaces();
      })
    );
  }

  private loadSavedWorkspace(): void {
    this.activeWorkspaceId = this.extensionContext.globalState.get('llmContext.activeWorkspaceId', '');
  }

  refreshWorkspaces(): void {
    this.workspaceCache.clear();
    this._onDidChangeWorkspaces.fire(this.getWorkspaces());
  }

  getWorkspaces(): WorkspaceInfo[] {
    const folders = vscode.workspace.workspaceFolders || [];
    
    return folders.map((folder, index) => {
      const id = this.getWorkspaceId(folder);
      const cached = this.workspaceCache.get(id);
      
      if (cached) {
        return cached;
      }

      const info: WorkspaceInfo = {
        id,
        name: folder.name,
        rootPath: folder.uri.fsPath,
        isActive: this.activeWorkspaceId ? this.activeWorkspaceId === id : index === 0,
      };

      this.workspaceCache.set(id, info);
      return info;
    });
  }

  private getWorkspaceId(folder: vscode.WorkspaceFolder): string {
    return folder.uri.toString();
  }

  getActiveWorkspace(): WorkspaceInfo | undefined {
    const workspaces = this.getWorkspaces();
    
    if (this.activeWorkspaceId) {
      return workspaces.find(ws => ws.id === this.activeWorkspaceId);
    }

    return workspaces[0];
  }

  async setActiveWorkspace(workspaceId: string): Promise<void> {
    this.activeWorkspaceId = workspaceId;
    await this.extensionContext.globalState.update('llmContext.activeWorkspaceId', workspaceId);
    
    this.workspaceCache.forEach((ws, id) => {
      ws.isActive = id === workspaceId;
    });

    this._onDidChangeWorkspaces.fire(this.getWorkspaces());
  }

  getWorkspaceByPath(rootPath: string): WorkspaceInfo | undefined {
    const normalizedPath = rootPath.replace(/\\/g, '/');
    
    for (const ws of this.workspaceCache.values()) {
      if (ws.rootPath.replace(/\\/g, '/') === normalizedPath) {
        return ws;
      }
    }

    return this.getWorkspaces().find(
      ws => ws.rootPath.replace(/\\/g, '/') === normalizedPath
    );
  }
}
