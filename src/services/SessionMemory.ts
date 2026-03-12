import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import { SessionMemoryEntry, SessionFileEntry, FileChangeInfo } from '../types';

export interface ISessionMemory {
  saveSession(entry: SessionMemoryEntry): Promise<void>;
  getLastSession(): SessionMemoryEntry | undefined;
  getSessionHistory(): SessionMemoryEntry[];
  clearHistory(): Promise<void>;
  detectChanges(workspaceRoot: string): Promise<FileChangeInfo[]>;
  generateDiffContent(changes: FileChangeInfo[]): string;
}

export class SessionMemory implements ISessionMemory {
  private readonly maxHistoryEntries = 10;
  private currentSession: SessionMemoryEntry | undefined;

  constructor(private extensionContext: vscode.ExtensionContext) {
    this.loadLastSession();
  }

  private loadLastSession(): void {
    this.currentSession = this.extensionContext.workspaceState.get('llmContext.lastSession');
  }

  async saveSession(entry: SessionMemoryEntry): Promise<void> {
    this.currentSession = entry;
    
    await this.extensionContext.workspaceState.update('llmContext.lastSession', entry);

    const history = this.getSessionHistory();
    const existingIndex = history.findIndex(h => h.id === entry.id);
    
    if (existingIndex >= 0) {
      history.splice(existingIndex, 1);
    }
    
    history.unshift(entry);
    
    while (history.length > this.maxHistoryEntries) {
      history.pop();
    }

    await this.extensionContext.workspaceState.update('llmContext.sessionHistory', history);
  }

  getLastSession(): SessionMemoryEntry | undefined {
    return this.currentSession;
  }

  getSessionHistory(): SessionMemoryEntry[] {
    return this.extensionContext.workspaceState.get<SessionMemoryEntry[]>('llmContext.sessionHistory', []);
  }

  async clearHistory(): Promise<void> {
    this.currentSession = undefined;
    await this.extensionContext.workspaceState.update('llmContext.lastSession', undefined);
    await this.extensionContext.workspaceState.update('llmContext.sessionHistory', []);
  }

  async detectChanges(workspaceRoot: string): Promise<FileChangeInfo[]> {
    const lastSession = this.getLastSession();
    if (!lastSession) {
      return [];
    }

    const changes: FileChangeInfo[] = [];
    const lastFilesMap = new Map(
      lastSession.files.map(f => [f.path, f])
    );

    for (const lastFile of lastSession.files) {
      const fullPath = path.join(workspaceRoot, lastFile.path);
      
      try {
        const stat = await fs.stat(fullPath);
        
        if (stat.mtimeMs > lastFile.lastModified) {
          const currentContent = await fs.readFile(fullPath, 'utf-8');
          
          if (currentContent !== lastFile.content) {
            changes.push({
              path: lastFile.path,
              status: 'modified',
              previousContent: lastFile.content,
              currentContent,
            });
          } else {
            changes.push({
              path: lastFile.path,
              status: 'unchanged',
            });
          }
        } else {
          changes.push({
            path: lastFile.path,
            status: 'unchanged',
          });
        }
      } catch {
        changes.push({
          path: lastFile.path,
          status: 'deleted',
          previousContent: lastFile.content,
        });
      }
    }

    const currentFilePaths = new Set(lastFilesMap.keys());
    for (const filePath of currentFilePaths) {
      const fullPath = path.join(workspaceRoot, filePath);
      
      try {
        await fs.stat(fullPath);
      } catch {
        if (!changes.find(c => c.path === filePath)) {
          changes.push({
            path: filePath,
            status: 'deleted',
            previousContent: lastFilesMap.get(filePath)?.content,
          });
        }
      }
    }

    return changes;
  }

  generateDiffContent(changes: FileChangeInfo[]): string {
    const lines: string[] = [];
    
    lines.push('# Incremental Context Changes\n');
    lines.push(`Generated at: ${new Date().toISOString()}\n`);
    lines.push('---\n\n');

    const modified = changes.filter(c => c.status === 'modified');
    const deleted = changes.filter(c => c.status === 'deleted');

    if (modified.length > 0) {
      lines.push('## Modified Files\n');
      
      for (const change of modified) {
        lines.push(`### ${change.path}\n`);
        lines.push('```');
        
        if (change.previousContent && change.currentContent) {
          const diff = this.generateSimpleDiff(
            change.previousContent,
            change.currentContent
          );
          lines.push(diff);
        }
        
        lines.push('```\n');
      }
    }

    if (deleted.length > 0) {
      lines.push('## Deleted Files\n');
      
      for (const change of deleted) {
        lines.push(`- ~~${change.path}~~\n`);
      }
      lines.push('');
    }

    if (modified.length === 0 && deleted.length === 0) {
      lines.push('No changes detected since last copy.\n');
    }

    return lines.join('\n');
  }

  private generateSimpleDiff(oldContent: string, newContent: string): string {
    const oldLines = oldContent.split('\n');
    const newLines = newContent.split('\n');
    const diffLines: string[] = [];

    const maxLines = Math.max(oldLines.length, newLines.length);
    
    for (let i = 0; i < Math.min(maxLines, 100); i++) {
      const oldLine = oldLines[i];
      const newLine = newLines[i];

      if (oldLine !== newLine) {
        if (oldLine !== undefined) {
          diffLines.push(`- ${oldLine}`);
        }
        if (newLine !== undefined) {
          diffLines.push(`+ ${newLine}`);
        }
      }
    }

    if (maxLines > 100) {
      diffLines.push(`... (${maxLines - 100} more lines)`);
    }

    return diffLines.join('\n') || '(content changed)';
  }

  async createIncrementalCopy(
    workspaceRoot: string,
    selectedPaths: string[]
  ): Promise<{
    content: string;
    isIncremental: boolean;
    changes: FileChangeInfo[];
  }> {
    const changes = await this.detectChanges(workspaceRoot);
    const modifiedPaths = new Set(
      changes.filter(c => c.status === 'modified').map(c => c.path)
    );

    const lastSession = this.getLastSession();
    if (!lastSession || changes.length === 0) {
      return {
        content: '',
        isIncremental: false,
        changes,
      };
    }

    const lastFilesMap = new Map(
      lastSession.files.map(f => [f.path, f])
    );

    const lines: string[] = [];
    lines.push('# Incremental Context\n');
    lines.push(`**Mode**: Changes only (${changes.filter(c => c.status !== 'unchanged').length} changed)\n`);
    lines.push(`**Full copy available**: Use "Copy Full Context" command\n`);
    lines.push('---\n\n');

    for (const relPath of selectedPaths) {
      const lastFile = lastFilesMap.get(relPath);
      const change = changes.find(c => c.path === relPath);

      if (!lastFile) {
        continue;
      }

      if (change?.status === 'modified' && change.currentContent) {
        lines.push('## ' + relPath + ' (modified)');
        lines.push('```');
        lines.push(change.currentContent);
        lines.push('```');
      } else if (change?.status === 'deleted') {
        lines.push('## ' + relPath + ' (deleted - previous content)');
        lines.push('```');
        lines.push(lastFile.content);
        lines.push('```');
      } else {
        lines.push('## ' + relPath + ' (unchanged - reference)');
        lines.push('```');
        lines.push(lastFile.content);
        lines.push('```');
      }
    }

    return {
      content: lines.join('\n'),
      isIncremental: true,
      changes,
    };
  }
}
