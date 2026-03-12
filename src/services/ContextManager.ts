/**
 * Core service interface for managing project context.
 * Handles file discovery, token counting, and compression strategies.
 * 
 * @example
 * ```typescript
 * const contextManager = new ContextManager(extensionContext);
 * const files = await contextManager.getStatsForPath('src/index.ts', false);
 * console.log(`Tokens: ${files.tokens}`);
 * ```
 */
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import { TokenCounterFactory, ITokenCounter } from '../token/TokenCounter';
import { CompressionEngine, CompressionEngineBuilder } from '../compression/CompressionEngine';
import {
  RemoveEmptyLinesStrategy,
  RemoveCommentsStrategy,
  MinifyWhitespaceStrategy,
  TruncateLongFilesStrategy,
  DeduplicateCodeStrategy,
  PrioritizeImportantFilesStrategy,
} from '../compression/CompressionStrategy';

interface TokenCacheEntry {
  size: number;
  mtime: number;
  tokens: number;
}

export class ContextManager {
  private _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChange = this._onDidChange.event;

  private workspaceRoot = '';
  private compressionEngine: CompressionEngine;
  private tokenCounter: ITokenCounter;
  private activeStrategies: Set<string> = new Set();
  private outputFormat: 'markdown' | 'json' | 'plain' | 'toon' = 'markdown';

  private tokenCache: Map<string, TokenCacheEntry> = new Map();

  constructor(private extensionContext: vscode.ExtensionContext) {
    this.tokenCounter = TokenCounterFactory.createDefault();
    this.compressionEngine = new CompressionEngineBuilder(this.tokenCounter)
      .withStrategy(new RemoveEmptyLinesStrategy())
      .withStrategy(new RemoveCommentsStrategy())
      .withStrategy(new MinifyWhitespaceStrategy())
      .withStrategy(new TruncateLongFilesStrategy())
      .withStrategy(new DeduplicateCodeStrategy())
      .withStrategy(new PrioritizeImportantFilesStrategy())
      .build() as CompressionEngine;

    this.updateWorkspaceRoot();
    this.loadSettings();

    extensionContext.subscriptions.push(
      vscode.workspace.onDidChangeWorkspaceFolders(() => {
        this.updateWorkspaceRoot();
        this.refresh();
      }),
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration('llm-context-copy')) {
          this.refresh();
        }
      })
    );
  }

  /**
   * Updates the workspace root path from the active VS Code workspace
   */
  private updateWorkspaceRoot(): void {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    this.workspaceRoot = workspaceFolder?.uri.fsPath || '';
  }

  /**
   * Loads persisted settings from extension global state
   */
  private loadSettings(): void {
    this.outputFormat = this.extensionContext.globalState.get('llmContext.outputFormat', 'markdown');
    const savedStrategies = this.extensionContext.globalState.get<string[]>('llmContext.strategies', []);
    this.activeStrategies = new Set(savedStrategies);
    this.updateContextKeys();
  }

  /**
   * Refreshes the context by clearing caches and firing change event
   */
  public refresh(): void {
    this.tokenCache.clear();
    this._onDidChange.fire();
  }

  /**
   * Gets the current workspace root path
   */
  public getWorkspaceRoot(): string {
    return this.workspaceRoot;
  }

  /**
   * Gets the current output format
   */
  public getOutputFormat(): string {
    return this.outputFormat;
  }

  /**
   * Gets the set of active compression strategies
   */
  public getActiveStrategies(): Set<string> {
    return this.activeStrategies;
  }

  /**
   * Sets the output format and persists to global state
   */
  public async setOutputFormat(format: 'markdown' | 'json' | 'plain' | 'toon'): Promise<void> {
    this.outputFormat = format;
    await this.extensionContext.globalState.update('llmContext.outputFormat', format);
    this.updateContextKeys();
    this.refresh();
  }

  /**
   * Toggles a compression strategy on/off
   */
  public async toggleStrategy(strategyName: string): Promise<void> {
    if (this.activeStrategies.has(strategyName)) {
      this.activeStrategies.delete(strategyName);
    } else {
      this.activeStrategies.add(strategyName);
    }

    await this.extensionContext.globalState.update('llmContext.strategies', Array.from(this.activeStrategies));
    this.updateContextKeys();
    this.refresh();
  }

  /**
   * Sets multiple active strategies at once
   */
  public async setActiveStrategies(strategies: string[]): Promise<void> {
    this.activeStrategies = new Set(strategies);
    await this.extensionContext.globalState.update('llmContext.strategies', strategies);
    this.updateContextKeys();
    this.refresh();
  }

  /**
   * Updates VS Code context for conditional UI visibility
   */
  private updateContextKeys(): void {
    vscode.commands.executeCommand('setContext', 'llmContextCopy.format', this.outputFormat);
    vscode.commands.executeCommand('setContext', 'llmContextCopy.strategyCount', this.activeStrategies.size);
  }

  /**
   * Calculates size and token count for a file or directory path
   * Uses caching to avoid redundant I/O operations
   */
  public async getStatsForPath(relativePath: string, isDirectory: boolean): Promise<{ size: number; tokens: number }> {
    if (!this.workspaceRoot) {
      return { size: 0, tokens: 0 };
    }

    const fullPath = path.join(this.workspaceRoot, relativePath.replace(/^\./, ''));

    try {
      if (isDirectory) {
        const files = await this.getAllFilesRecursive(fullPath);
        let totalSize = 0;
        let totalTokens = 0;

        for (const file of files) {
          const stats = await this.getFileStats(file);
          totalSize += stats.size;
          totalTokens += stats.tokens;
        }
        return { size: totalSize, tokens: totalTokens };
      } else {
        return await this.getFileStats(fullPath);
      }
    } catch (error) {
      console.error(`Error calculating stats for ${relativePath}:`, error);
      return { size: 0, tokens: 0 };
    }
  }

  /**
   * Gets file statistics with caching support
   */
  private async getFileStats(fullPath: string): Promise<{ size: number; tokens: number }> {
    try {
      const stat = await fs.stat(fullPath);
      const mtime = stat.mtimeMs;

      const cached = this.tokenCache.get(fullPath);
      if (cached && cached.mtime === mtime) {
        return { size: cached.size, tokens: cached.tokens };
      }

      const content = await fs.readFile(fullPath, 'utf-8');
      const rawTokens = this.tokenCounter.countTokens(content);

      this.tokenCache.set(fullPath, {
        size: stat.size,
        mtime,
        tokens: rawTokens,
      });

      return { size: stat.size, tokens: rawTokens };
    } catch {
      return { size: 0, tokens: 0 };
    }
  }

  /**
   * Recursively collects all files in a directory
   * Excludes node_modules and hidden files
   */
  private async getAllFilesRecursive(dirPath: string): Promise<string[]> {
    const files: string[] = [];
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        if (entry.name.startsWith('.') || entry.name === 'node_modules') {
          continue;
        }

        if (entry.isDirectory()) {
          files.push(...await this.getAllFilesRecursive(fullPath));
        } else {
          files.push(fullPath);
        }
      }
    } catch { /* ignore */ }
    return files;
  }

  /**
   * Gets the compression engine instance
   */
  public getCompressionEngine(): CompressionEngine {
    return this.compressionEngine;
  }

  /**
   * Gets the token counter instance
   */
  public getTokenCounter(): ITokenCounter {
    return this.tokenCounter;
  }
}
