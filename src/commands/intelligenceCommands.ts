import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import { ServiceTokens } from '../di/tokens';
import { CommandRegistrar } from './types';
import { FILE_READING } from './constants';

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

async function readFileWithLimit(filePath: string): Promise<{ content: string; size: number } | null> {
  try {
    const stats = await fs.stat(filePath);
    if (stats.size > FILE_READING.MAX_FILE_SIZE_BYTES) {
      return null;
    }
    const content = await fs.readFile(filePath, 'utf-8');
    return { content, size: stats.size };
  } catch {
    return null;
  }
}

export class IntelligenceCommands implements CommandRegistrar {
  register(): vscode.Disposable[] {
    const commands: vscode.Disposable[] = [];

    commands.push(
      vscode.commands.registerCommand('llm-context-copy.suggestRelated', async () => {
        const intelligenceManager = tryGetService(ServiceTokens.IntelligenceManager);
        const treeViewProvider = getService(ServiceTokens.TreeViewProvider);
        const contextManager = getService(ServiceTokens.ContextManager);
        const logger = getService(ServiceTokens.Logger);

        if (!intelligenceManager) {
          vscode.window.showWarningMessage('Intelligence features not available.');
          return;
        }

        const activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor) {
          vscode.window.showInformationMessage('No active file. Select files manually.');
          return;
        }

        const activePath = activeEditor.document.uri.fsPath;
        const root = contextManager.getWorkspaceRoot();
        if (!root) {
          vscode.window.showWarningMessage('No workspace root found.');
          return;
        }

        try {
          const allFiles = await treeViewProvider.getAllProjectFiles(root);
          const limitedFiles = allFiles.slice(0, FILE_READING.MAX_FILES_FOR_DEPENDENCY_ANALYSIS);
          
          if (allFiles.length > FILE_READING.MAX_FILES_FOR_DEPENDENCY_ANALYSIS) {
            vscode.window.showInformationMessage(
              `Analyzing ${FILE_READING.MAX_FILES_FOR_DEPENDENCY_ANALYSIS} of ${allFiles.length} files for performance.`
            );
          }

          const filesWithContent = [];
          for (let i = 0; i < limitedFiles.length; i += FILE_READING.BATCH_SIZE) {
            const batch = limitedFiles.slice(i, i + FILE_READING.BATCH_SIZE);
            const batchResults = await Promise.all(
              batch.map(async (filePath) => {
                const result = await readFileWithLimit(filePath);
                if (!result) return null;
                const relPath = path.relative(root, filePath).replace(/\\/g, '/');
                return {
                  path: filePath,
                  content: result.content,
                  language: path.extname(filePath).replace('.', '') || 'plaintext',
                  relativePath: relPath,
                  stats: { size: result.size, isDirectory: false },
                };
              })
            );
            filesWithContent.push(...batchResults.filter((f): f is NonNullable<typeof f> => f !== null));
          }

          await intelligenceManager.analyzeDependencies(filesWithContent);
          const related = intelligenceManager.suggestRelatedFiles(activePath);

          for (const relPath of related) {
            await treeViewProvider.checkItem(relPath);
          }

          vscode.window.showInformationMessage(`Auto-selected ${related.length} related files based on dependencies.`);
        } catch (error) {
          logger.error('Failed to suggest related files:', error as Error);
          vscode.window.showErrorMessage('Failed to analyze dependencies.');
        }
      }),

      vscode.commands.registerCommand('llm-context-copy.applySemanticCompression', async () => {
        try {
          const treeViewProvider = getService(ServiceTokens.TreeViewProvider);
          treeViewProvider.setSemanticCompressionEnabled(true);
          vscode.window.showInformationMessage('Semantic compression enabled.');
        } catch (error) {
          vscode.window.showErrorMessage('Failed to enable semantic compression.');
        }
      }),

      vscode.commands.registerCommand('llm-context-copy.autoSortFiles', async () => {
        try {
          const treeViewProvider = getService(ServiceTokens.TreeViewProvider);
          await treeViewProvider.applySmartSort();
          vscode.window.showInformationMessage('Files sorted by dependency order.');
        } catch (error) {
          vscode.window.showErrorMessage('Failed to sort files.');
        }
      }),

      vscode.commands.registerCommand('llm-context-copy.suggestRelevant', async () => {
        try {
          const treeViewProvider = getService(ServiceTokens.TreeViewProvider);
          await treeViewProvider.suggestRelevantFiles();
          vscode.window.showInformationMessage('Suggested relevant files based on current context.');
        } catch (error) {
          vscode.window.showErrorMessage('Failed to suggest relevant files.');
        }
      })
    );

    return commands;
  }
}
