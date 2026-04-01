import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import { ContextManager } from '../services/ContextManager';
import { CopyService } from '../services/CopyService';
import { WorkspaceManager } from '../services/WorkspaceManager';
import { SessionMemory } from '../services/SessionMemory';
import { TokenBudgetManager } from '../services/TokenBudgetManager';
import { PreviewPanel } from '../preview/PreviewPanel';
import { VirtualizedTreeProvider } from '../performance/VirtualizedTree';
import { TreeItemData, ProjectContext, FormatterOptions, SessionMemoryEntry, FileContext } from '../types';
import { CompressionEngine } from '../compression/CompressionEngine';
import { isBinaryFile, getBinaryFileCategory } from '../utils/FileUtils';
import { IgnoreMatcher } from '../utils/IgnoreMatcher';

const LANGUAGE_MAP: Record<string, string> = {
  '.js': 'javascript',
  '.ts': 'typescript',
  '.tsx': 'typescriptreact',
  '.jsx': 'javascriptreact',
  '.py': 'python',
  '.java': 'java',
  '.c': 'c',
  '.cpp': 'cpp',
  '.cs': 'csharp',
  '.go': 'go',
  '.rs': 'rust',
  '.php': 'php',
  '.rb': 'ruby',
  '.swift': 'swift',
  '.kt': 'kotlin',
  '.dart': 'dart',
  '.lua': 'lua',
  '.sh': 'shell',
  '.bash': 'shell',
  '.zsh': 'shell',
  '.sql': 'sql',
  '.json': 'json',
  '.xml': 'xml',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.toml': 'toml',
  '.md': 'markdown',
  '.html': 'html',
  '.css': 'css',
  '.scss': 'scss',
  '.sass': 'sass',
  '.less': 'less',
  '.svg': 'svg',
};

function detectLanguage(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return LANGUAGE_MAP[ext] || 'plaintext';
}

interface ContentCollectionOptions {
  enforceTotalSize: boolean;
  totalSizeLimit: number;
}

interface CollectedContextResult {
  context: ProjectContext | null;
  binaryFilesInfo: { path: string; category: string; size: number }[];
  directoriesSkipped: string[];
  oversizedFiles: { path: string; size: number }[];
  skippedByTotalLimit: { path: string; size: number }[];
}

export class TreeViewProvider implements vscode.TreeDataProvider<FileTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<FileTreeItem | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private _onDidChangeSelection = new vscode.EventEmitter<{ files: number; size: number; filePaths: string[]; rawTokens: number; compressedTokens: number }>();
  readonly onDidChangeSelection = this._onDidChangeSelection.event;

  private checkedItems: Set<string> = new Set();
  private copyService: CopyService;
  private workspaceManager?: WorkspaceManager;
  private sessionMemory?: SessionMemory;
  private tokenBudgetManager?: TokenBudgetManager;
  private selectionCache: Map<string, { size: number; isDirectory: boolean; tokens?: number }> = new Map();
  private virtualizedTree?: VirtualizedTreeProvider;
  private isLoading = false;
  private loadingCancellationToken?: vscode.CancellationTokenSource;
  private ignoreMatcher: IgnoreMatcher = IgnoreMatcher.empty();
  private settingsReady: Promise<void> = Promise.resolve();
  private maxFileSize = 2 * 1024 * 1024;
  private maxTotalSize = 8 * 1024 * 1024;
  private maxDepth = 10;

  constructor(
    private extensionContext: vscode.ExtensionContext,
    private contextManager: ContextManager,
    workspaceManager?: WorkspaceManager,
    sessionMemory?: SessionMemory,
    tokenBudgetManager?: TokenBudgetManager
  ) {
    this.copyService = this.createCopyService();
    this.workspaceManager = workspaceManager;
    this.sessionMemory = sessionMemory;
    this.tokenBudgetManager = tokenBudgetManager;
    this.settingsReady = this.reloadRuntimeSettings();
    this.initializeVirtualizedTree();

    this.contextManager.onDidChange(() => {
      this.refresh();
    });
  }

  private initializeVirtualizedTree(): void {
    const root = this.contextManager.getWorkspaceRoot();
    if (root) {
      this.virtualizedTree = new VirtualizedTreeProvider(root, {
        chunkSize: 100,
        maxDepth: this.maxDepth,
        batchDelay: 5,
      });
    }
  }

  private createCopyService(): CopyService {
    return new CopyService({
      formatterOptions: {
        outputFormat: this.contextManager.getOutputFormat() as FormatterOptions['outputFormat'],
        includeStats: true,
        includeStructure: false,
        collapseEmptyLines: false,
      },
      compressionEngine: this.contextManager.getCompressionEngine(),
      tokenCounter: this.contextManager.getTokenCounter(),
    });
  }

  refresh(): void {
    this.copyService = this.createCopyService();
    this.settingsReady = this.reloadRuntimeSettings();
    this.selectionCache.clear();
    this.virtualizedTree?.invalidateTree();
    this.initializeVirtualizedTree();
    this.loadingCancellationToken?.cancel();
    this.isLoading = false;
    this._onDidChangeTreeData.fire();
  }

  private async reloadRuntimeSettings(): Promise<void> {
    const root = this.contextManager.getWorkspaceRoot();
    const config = vscode.workspace.getConfiguration('llm-context-copy');

    this.maxFileSize = Math.max(0, config.get<number>('maxFileSize', 2 * 1024 * 1024));
    this.maxTotalSize = Math.max(this.maxFileSize, config.get<number>('maxTotalSize', 8 * 1024 * 1024));
    this.maxDepth = Math.max(1, config.get<number>('maxDepth', 10));

    const excludePatterns = config.get<string[]>('excludePatterns', []);
    this.ignoreMatcher = await IgnoreMatcher.create(root, excludePatterns);
  }

  private async ensureSettingsLoaded(): Promise<void> {
    await this.settingsReady;
  }

  getTreeItem(element: FileTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: FileTreeItem): Promise<FileTreeItem[]> {
    await this.ensureSettingsLoaded();

    const root = this.contextManager.getWorkspaceRoot();
    if (!root) { return []; }

    if (!element) {
      return this.getRootItems();
    }

    if (this.isLoading) {
      this.loadingCancellationToken?.cancel();
    }

    this.isLoading = true;
    this.loadingCancellationToken = new vscode.CancellationTokenSource();
    const token = this.loadingCancellationToken.token;

    try {
      const dirPath = element.itemData.uri.fsPath;

      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Loading timeout')), 30000);
      });

      const loadPromise = this.loadChildrenWithCancellation(dirPath, root, token);
      const children = await Promise.race([loadPromise, timeoutPromise]);

      return children;
    } catch (error) {
      if (error instanceof Error && error.message === 'Loading timeout') {
        vscode.window.showWarningMessage(
          'Folder loading took too long. Try using the refresh button or select a smaller folder.'
        );
      }
      console.error(`Error getting children:`, error);
      return [];
    } finally {
      this.isLoading = false;
    }
  }

  private async loadChildrenWithCancellation(
    dirPath: string,
    root: string,
    token: vscode.CancellationToken
  ): Promise<FileTreeItem[]> {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const children: FileTreeItem[] = [];

    const batchSize = 50;
    for (let i = 0; i < entries.length; i += batchSize) {
      if (token.isCancellationRequested) {
        return children;
      }

      const batch = entries.slice(i, i + batchSize);

      await Promise.all(batch.map(async (entry) => {
        if (token.isCancellationRequested) { return; }

        const fullPath = path.join(dirPath, entry.name);
        const relativePath = path.relative(root, fullPath).replace(/\\/g, '/');

        if (this.shouldExclude(relativePath, entry.name, entry.isDirectory())) {
          return;
        }

        try {
          const stats = entry.isDirectory()
            ? { size: 0, tokens: undefined }
            : await this.contextManager.getStatsForPath(relativePath, false);

          const itemData: TreeItemData = {
            uri: vscode.Uri.file(fullPath),
            relativePath,
            name: entry.name,
            type: entry.isDirectory() ? 'directory' : 'file',
            size: stats.size,
            tokenCount: stats.tokens,
          };

          const isChecked = this.isItemChecked(relativePath, entry.isDirectory());
          const collapsibleState = entry.isDirectory()
            ? vscode.TreeItemCollapsibleState.Collapsed
            : vscode.TreeItemCollapsibleState.None;

          this.updateSelectionCache(relativePath, stats.size, entry.isDirectory());

          children.push(new FileTreeItem(relativePath, itemData, isChecked, collapsibleState));
        } catch {
          // Skip files that can't be accessed
        }
      }));

      if (i + batchSize < entries.length) {
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }

    return children.sort((a, b) => {
      if (a.itemData.type === b.itemData.type) {
        return a.itemData.name.localeCompare(b.itemData.name);
      }
      return a.itemData.type === 'directory' ? -1 : 1;
    });
  }

  private async getRootItems(): Promise<FileTreeItem[]> {
    const root = this.contextManager.getWorkspaceRoot();
    if (!root) { return []; }

    const itemData: TreeItemData = {
      uri: vscode.Uri.file(root),
      relativePath: '.',
      name: path.basename(root),
      type: 'directory',
      size: 0,
    };

    const isChecked = this.isItemChecked('.', true);

    const rootItem = new FileTreeItem('.', itemData, isChecked, vscode.TreeItemCollapsibleState.Expanded);
    rootItem.tooltip = `Project Root: ${root}`;

    return [rootItem];
  }

  private isItemChecked(relativePath: string, isDirectory: boolean): boolean {
    if (this.checkedItems.has(relativePath)) {
      return true;
    }

    if (isDirectory) {
      for (const checked of this.checkedItems) {
        if (checked.startsWith(relativePath + '/')) {
          return true;
        }
      }
    }

    return false;
  }

  async checkItem(itemId: string | undefined): Promise<void> {
    if (!itemId) { return; }
    await this.ensureSettingsLoaded();

    const root = this.contextManager.getWorkspaceRoot();
    if (!root) { return; }

    this.checkedItems.add(itemId);

    const fullPath = path.join(root, itemId);
    try {
      const stat = await fs.stat(fullPath);
      if (stat.isDirectory()) {
        const children = await this.getAllFilesRecursive(fullPath);
        if (children.length === 0) {
          console.warn(`[LLM Context Copy] No files found in directory: ${itemId}`);
        }
        for (const child of children) {
          const rel = path.relative(root, child).replace(/\\/g, '/');
          this.checkedItems.add(rel);
        }
      }
    } catch (error) {
      console.error(`[LLM Context Copy] Error checking item ${itemId}:`, error);
    }

    this._onDidChangeTreeData.fire();
    await this.notifySelectionChanged();
  }

  async uncheckItem(itemId: string | undefined): Promise<void> {
    if (!itemId) { return; }
    await this.ensureSettingsLoaded();

    const root = this.contextManager.getWorkspaceRoot();
    if (!root) { return; }

    this.checkedItems.delete(itemId);

    const fullPath = path.join(root, itemId);
    try {
      const stat = await fs.stat(fullPath);
      if (stat.isDirectory()) {
        const children = await this.getAllFilesRecursive(fullPath);
        for (const child of children) {
          const rel = path.relative(root, child).replace(/\\/g, '/');
          this.checkedItems.delete(rel);
        }
      }
    } catch (error) {
      console.error(`[LLM Context Copy] Error unchecking item ${itemId}:`, error);
    }

    this._onDidChangeTreeData.fire();
    await this.notifySelectionChanged();
  }

  private async notifySelectionChanged(): Promise<void> {
    let files = 0;
    let totalSize = 0;
    let totalRawTokens = 0;
    const filePaths: string[] = [];
    const root = this.contextManager.getWorkspaceRoot();

    for (const itemId of this.checkedItems) {
      const cached = this.selectionCache.get(itemId);
      if (cached) {
        if (!cached.isDirectory) {
          files++;
          totalSize += cached.size;
          totalRawTokens += cached.tokens ?? 0;
          filePaths.push(itemId);
        }
        continue;
      }

      if (root) {
        try {
          const fullPath = path.join(root, itemId);
          const stat = await fs.stat(fullPath);
          if (stat.isDirectory()) {
            this.selectionCache.set(itemId, { size: 0, isDirectory: true });
          } else {
            const stats = await this.contextManager.getStatsForPath(itemId, false);
            files++;
            totalSize += stats.size;
            totalRawTokens += stats.tokens;
            filePaths.push(itemId);
            this.selectionCache.set(itemId, { size: stats.size, isDirectory: false, tokens: stats.tokens });
          }
        } catch {
          // Skip items that can't be accessed
        }
      }
    }

    let compressedTokens = totalRawTokens;
    if (files > 0 && root) {
      try {
        const filesToCompress = await this.collectAbsoluteFileContexts(
          filePaths.map((filePath) => path.join(root, filePath))
        );

        if (filesToCompress.length > 0) {
          const context = this.createProjectContext(root, filesToCompress);

          const activeStrategies = Array.from(this.contextManager.getActiveStrategies());
          if (activeStrategies.length > 0) {
            const compressionEngine = this.contextManager.getCompressionEngine() as CompressionEngine;
            const result = await compressionEngine.compressWithStrategies(context, activeStrategies);
            compressedTokens = result.compressedTokens;
          }
        }
      } catch (error) {
        console.error('[LLM Context Copy] Error calculating compressed tokens:', error);
      }
    }

    this._onDidChangeSelection.fire({ files, size: totalSize, filePaths, rawTokens: totalRawTokens, compressedTokens });
  }

  getCheckedItems(): Set<string> {
    return this.checkedItems;
  }

  updateSelectionCache(itemId: string, size: number, isDirectory: boolean, tokens?: number): void {
    this.selectionCache.set(itemId, { size, isDirectory, tokens });
  }

  toggleItem(itemId: string | undefined): void {
    if (!itemId) { return; }

    if (this.checkedItems.has(itemId)) {
      this.uncheckItem(itemId);
    } else {
      this.checkItem(itemId);
    }
  }

  async selectAll(): Promise<void> {
    await this.checkItem('.');
  }

  deselectAll(): void {
    this.checkedItems.clear();
    this._onDidChangeTreeData.fire();
  }

  private shouldExclude(relativePath: string, fileName: string, isDirectory: boolean): boolean {
    // Always hide dot-files except .gitignore
    if (fileName.startsWith('.') && fileName !== '.gitignore') {
      return true;
    }

    return this.ignoreMatcher.ignores(relativePath, isDirectory);
  }

  private async getAllFilesRecursive(dirPath: string, depth = 0): Promise<string[]> {
    const files: string[] = [];
    const root = this.contextManager.getWorkspaceRoot();
    if (!root || depth > this.maxDepth) { return files; }

    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        const relativePath = path.relative(root, fullPath).replace(/\\/g, '/');

        if (this.shouldExclude(relativePath, entry.name, entry.isDirectory())) {
          continue;
        }

        if (entry.isDirectory()) {
          const subFiles = await this.getAllFilesRecursive(fullPath, depth + 1);
          files.push(...subFiles);
        } else {
          files.push(fullPath);
        }
      }
    } catch (error) {
      console.error(`[LLM Context Copy] Error reading directory ${dirPath}:`, error);
    }

    return files;
  }

  private createProjectContext(root: string, files: FileContext[]): ProjectContext {
    return {
      files,
      structure: null,
      metadata: {
        rootPath: root,
        totalFiles: files.length,
        totalSize: files.reduce((sum, file) => sum + file.stats.size, 0),
        tokenCount: 0,
        timestamp: Date.now(),
      },
    };
  }

  private createBinaryFileContext(fullPath: string, relativePath: string, size: number): FileContext {
    return {
      path: fullPath,
      content: '[Binary file - content not included]',
      language: 'plaintext',
      relativePath,
      stats: { size, isDirectory: false },
      isBinary: true,
      binaryCategory: getBinaryFileCategory(fullPath),
    };
  }

  private createOversizedFileContext(fullPath: string, relativePath: string, size: number): FileContext {
    return {
      path: fullPath,
      content: [
        '[File omitted - exceeds maximum file size]',
        `Path: ${relativePath}`,
        `Size: ${this.formatSize(size)}`,
        `Configured limit: ${this.formatSize(this.maxFileSize)}`,
      ].join('\n'),
      language: 'plaintext',
      relativePath,
      stats: { size, isDirectory: false },
    };
  }

  private async createFileContextFromPath(fullPath: string, relativePath: string, stat: { size: number }): Promise<FileContext> {
    if (isBinaryFile(fullPath)) {
      return this.createBinaryFileContext(fullPath, relativePath, stat.size);
    }

    if (this.maxFileSize > 0 && stat.size > this.maxFileSize) {
      return this.createOversizedFileContext(fullPath, relativePath, stat.size);
    }

    const content = await fs.readFile(fullPath, 'utf-8');
    return {
      path: fullPath,
      content,
      language: detectLanguage(fullPath),
      relativePath,
      stats: { size: stat.size, isDirectory: false },
    };
  }

  private async collectFileContexts(
    relativePaths: Iterable<string>,
    options: ContentCollectionOptions
  ): Promise<CollectedContextResult> {
    await this.ensureSettingsLoaded();

    const root = this.contextManager.getWorkspaceRoot();
    if (!root) {
      return {
        context: null,
        binaryFilesInfo: [],
        directoriesSkipped: [],
        oversizedFiles: [],
        skippedByTotalLimit: [],
      };
    }

    const filesToCopy: FileContext[] = [];
    const directoriesSkipped: string[] = [];
    const binaryFilesInfo: { path: string; category: string; size: number }[] = [];
    const oversizedFiles: { path: string; size: number }[] = [];
    const skippedByTotalLimit: { path: string; size: number }[] = [];
    let totalReadableBytes = 0;

    for (const relPath of relativePaths) {
      const fullPath = path.join(root, relPath);

      try {
        const stat = await fs.stat(fullPath);
        if (stat.isDirectory()) {
          directoriesSkipped.push(relPath);
          continue;
        }

        if (
          options.enforceTotalSize
          && options.totalSizeLimit > 0
          && !isBinaryFile(fullPath)
          && (this.maxFileSize === 0 || stat.size <= this.maxFileSize)
          && totalReadableBytes + stat.size > options.totalSizeLimit
        ) {
          skippedByTotalLimit.push({ path: relPath, size: stat.size });
          continue;
        }

        const fileContext = await this.createFileContextFromPath(fullPath, relPath, stat);
        filesToCopy.push(fileContext);

        if (fileContext.isBinary) {
          binaryFilesInfo.push({
            path: relPath,
            category: fileContext.binaryCategory || 'Binary',
            size: stat.size,
          });
        } else if (this.maxFileSize > 0 && stat.size > this.maxFileSize) {
          oversizedFiles.push({ path: relPath, size: stat.size });
        } else {
          totalReadableBytes += stat.size;
        }
      } catch (error) {
        console.error(`[LLM Context Copy] Error reading file ${relPath}:`, error);
      }
    }

    return {
      context: filesToCopy.length > 0 ? this.createProjectContext(root, filesToCopy) : null,
      binaryFilesInfo,
      directoriesSkipped,
      oversizedFiles,
      skippedByTotalLimit,
    };
  }

  private async collectAbsoluteFileContexts(
    filePaths: Iterable<string>,
    enforceTotalSize = false
  ): Promise<FileContext[]> {
    const root = this.contextManager.getWorkspaceRoot();
    if (!root) {
      return [];
    }

    const result = await this.collectFileContexts(
      Array.from(filePaths, (filePath) => path.relative(root, filePath).replace(/\\/g, '/')),
      {
        enforceTotalSize,
        totalSizeLimit: this.maxTotalSize,
      }
    );

    return result.context?.files ?? [];
  }

  private formatCollectionWarnings(result: CollectedContextResult): string[] {
    const warnings: string[] = [];

    if (result.oversizedFiles.length > 0) {
      warnings.push(
        `${result.oversizedFiles.length} file(s) exceeded ${this.formatSize(this.maxFileSize)} and were added as path-only placeholders.`
      );
    }

    if (result.skippedByTotalLimit.length > 0) {
      warnings.push(
        `${result.skippedByTotalLimit.length} file(s) were skipped because selected readable content exceeded ${this.formatSize(this.maxTotalSize)}.`
      );
    }

    return warnings;
  }

  private formatSize(bytes: number): string {
    if (bytes < 1024) {
      return `${bytes} B`;
    }
    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  async copySelectedItems(): Promise<void> {
    const root = this.contextManager.getWorkspaceRoot();
    if (!root) {
      vscode.window.showWarningMessage('No workspace folder open.');
      return;
    }

    if (this.checkedItems.size === 0) {
      vscode.window.showWarningMessage('No files selected. Please select files from the tree view.');
      return;
    }

    const result = await this.collectFileContexts(this.checkedItems, {
      enforceTotalSize: true,
      totalSizeLimit: this.maxTotalSize,
    });

    if (!result.context) {
      if (result.directoriesSkipped.length > 0) {
        vscode.window.showWarningMessage(
          `Only directories were selected (${result.directoriesSkipped.length}). Please expand folders and select individual files, or use "Select All" to include all files.`
        );
      } else if (result.skippedByTotalLimit.length > 0) {
        vscode.window.showWarningMessage(
          `Selection exceeds the safe readable content limit of ${this.formatSize(this.maxTotalSize)}. Reduce the selection or enable compression before copying.`
        );
      } else {
        vscode.window.showWarningMessage('No files selected. Please select files from the tree view.');
      }
      return;
    }

    const strategies = Array.from(this.contextManager.getActiveStrategies());
    await this.copyService.copyToClipboard(result.context, strategies);

    if (result.binaryFilesInfo.length > 0) {
      const binarySummary = result.binaryFilesInfo.map(f => `${f.path} (${f.category})`).join(', ');
      vscode.window.showInformationMessage(
        `✓ Copied ${result.context.files.length} files. ${result.binaryFilesInfo.length} binary file(s) included as path reference only: ${binarySummary}`
      );
    }

    const warnings = this.formatCollectionWarnings(result);
    if (warnings.length > 0) {
      vscode.window.showWarningMessage(warnings.join(' '));
    }

    if (this.sessionMemory) {
      const sessionEntry: SessionMemoryEntry = {
        id: Date.now().toString(),
        timestamp: Date.now(),
        files: result.context.files.map(f => ({
          path: f.relativePath,
          content: f.content,
          lastModified: Date.now(),
          isModified: false,
        })),
        totalTokens: result.context.metadata.tokenCount,
        compressionStrategies: strategies,
        outputFormat: this.contextManager.getOutputFormat(),
      };
      await this.sessionMemory.saveSession(sessionEntry);
    }
  }

  async copyIncremental(): Promise<void> {
    const root = this.contextManager.getWorkspaceRoot();
    if (!root) {
      vscode.window.showWarningMessage('No workspace folder open.');
      return;
    }

    if (!this.sessionMemory) {
      vscode.window.showWarningMessage('Session memory not available.');
      return;
    }

    const selectedPaths = Array.from(this.checkedItems);
    if (selectedPaths.length === 0) {
      vscode.window.showWarningMessage('No files selected.');
      return;
    }

    const result = await this.sessionMemory.createIncrementalCopy(root, selectedPaths);
    
    if (!result.isIncremental) {
      const choice = await vscode.window.showInformationMessage(
        'No previous session found. Copy full context instead?',
        'Copy Full Context',
        'Cancel'
      );
      
      if (choice === 'Copy Full Context') {
        await this.copySelectedItems();
      }
      return;
    }

    await vscode.env.clipboard.writeText(result.content);
    
    const changedCount = result.changes.filter(c => c.status !== 'unchanged').length;
    vscode.window.showInformationMessage(
      `✓ Copied incremental changes (${changedCount} file(s) changed)`
    );
  }

  async showPreview(): Promise<void> {
    const root = this.contextManager.getWorkspaceRoot();
    if (!root) {
      vscode.window.showWarningMessage('No workspace folder open.');
      return;
    }

    if (this.checkedItems.size === 0) {
      vscode.window.showWarningMessage('No files selected. Please select files from the tree view.');
      return;
    }

    const result = await this.collectFileContexts(this.checkedItems, {
      enforceTotalSize: true,
      totalSizeLimit: this.maxTotalSize,
    });

    if (!result.context) {
      if (result.directoriesSkipped.length > 0) {
        vscode.window.showWarningMessage(
          `Only directories were selected (${result.directoriesSkipped.length}). Please expand folders and select individual files, or use "Select All" to include all files.`
        );
      } else if (result.skippedByTotalLimit.length > 0) {
        vscode.window.showWarningMessage(
          `Preview exceeds the safe readable content limit of ${this.formatSize(this.maxTotalSize)}. Reduce the selection before previewing.`
        );
      } else {
        vscode.window.showWarningMessage('No files selected. Please select files from the tree view.');
      }
      return;
    }

    let context = result.context;

    const activeStrategies = Array.from(this.contextManager.getActiveStrategies());
    if (activeStrategies.length > 0) {
      const compressionEngine = this.contextManager.getCompressionEngine() as CompressionEngine;
      const result = await compressionEngine.compressWithStrategies(context, activeStrategies);
      context = result.context;
    }

    const warnings = this.formatCollectionWarnings(result);
    if (warnings.length > 0) {
      vscode.window.showWarningMessage(warnings.join(' '));
    }

    const preview = new PreviewPanel(this.extensionContext, this.contextManager.getTokenCounter());
    await preview.show(context);
  }

  async applyTokenBudget(): Promise<void> {
    if (!this.tokenBudgetManager) {
      vscode.window.showWarningMessage('Token budget manager not available.');
      return;
    }

    const root = this.contextManager.getWorkspaceRoot();
    if (!root) {
      vscode.window.showWarningMessage('No workspace folder open.');
      return;
    }

    const tokenInput = await vscode.window.showInputBox({
      title: 'Token Budget',
      prompt: 'Enter target token limit (e.g., 128000, 64000)',
      value: '128000',
      validateInput: (value) => {
        const num = parseInt(value, 10);
        if (isNaN(num) || num <= 0) {
          return 'Please enter a valid positive number';
        }
        return null;
      },
    });

    if (!tokenInput) { return; }

    const targetTokens = parseInt(tokenInput, 10);
    this.tokenBudgetManager.updateConfig({ maxTokens: targetTokens });

    const allFiles = await this.getAllProjectFiles(root);
    const filesWithContent = await this.collectAbsoluteFileContexts(allFiles);

    const result = await this.tokenBudgetManager.calculateOptimalSelection(
      filesWithContent,
      targetTokens
    );

    this.checkedItems.clear();
    for (const filePath of result.selectedFiles) {
      this.checkedItems.add(filePath);
    }

    this._onDidChangeTreeData.fire();

    const msg = result.withinBudget
      ? `✓ Selected ${result.selectedFiles.length} files within ${targetTokens} token budget (~${result.estimatedTokens} tokens)`
      : `⚠ Selected ${result.selectedFiles.length} files, estimated ${result.estimatedTokens} tokens (exceeds ${targetTokens})`;

    if (result.recommendations.length > 0) {
      vscode.window.showWarningMessage(msg + '\n' + result.recommendations.slice(0, 2).join('\n'));
    } else {
      vscode.window.showInformationMessage(msg);
    }
  }

  async getAllProjectFiles(root: string): Promise<string[]> {
    await this.ensureSettingsLoaded();

    const files: string[] = [];
    
    try {
      const entries = await fs.readdir(root, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(root, entry.name);
        const relativePath = entry.name;
        
        if (this.shouldExclude(relativePath, entry.name, entry.isDirectory())) {
          continue;
        }
        
        if (entry.isDirectory()) {
          files.push(...await this.getAllFilesRecursive(fullPath, 1));
        } else {
          files.push(fullPath);
        }
      }
    } catch { /* ignore */ }
    
    return files;
  }

  async showSettings(): Promise<void> {
    const currentFormat = this.contextManager.getOutputFormat();
    const formatPick = await vscode.window.showQuickPick(
      [
        { label: '$(file-code) Markdown', description: 'Standard markdown', value: 'markdown', picked: currentFormat === 'markdown' },
        { label: '$(bracket) JSON', description: 'JSON format', value: 'json', picked: currentFormat === 'json' },
        { label: '$(file-text) Plain Text', description: 'Plain text', value: 'plain', picked: currentFormat === 'plain' },
        { label: '$(symbol-namespace) TOON', description: 'Token Optimized', value: 'toon', picked: currentFormat === 'toon' },
      ],
      { placeHolder: 'Select output format' }
    );

    if (formatPick) {
      await this.contextManager.setOutputFormat(formatPick.value as any);
    }

    const active = this.contextManager.getActiveStrategies();
    const strategies = [
      { label: 'Remove Empty Lines', name: 'removeEmptyLines', picked: active.has('removeEmptyLines') },
      { label: 'Remove Comments', name: 'removeComments', picked: active.has('removeComments') },
      { label: 'Minify Whitespace', name: 'minifyWhitespace', picked: active.has('minifyWhitespace') },
      { label: 'Truncate Long Files', name: 'truncateLongFiles', picked: active.has('truncateLongFiles') },
      { label: 'Deduplicate Code', name: 'deduplicateCode', picked: active.has('deduplicateCode') },
      { label: 'Prioritize Important Files', name: 'prioritizeImportantFiles', picked: active.has('prioritizeImportantFiles') },
    ];

    const selected = await vscode.window.showQuickPick(strategies, {
      canPickMany: true,
      placeHolder: 'Select compression strategies',
    });

    if (selected) {
      await this.contextManager.setActiveStrategies(selected.map(s => s.name));
    }
  }

  async getSelectedContext(): Promise<ProjectContext | null> {
    const root = this.contextManager.getWorkspaceRoot();
    if (!root) { return null; }

    const result = await this.collectFileContexts(this.checkedItems, {
      enforceTotalSize: true,
      totalSizeLimit: this.maxTotalSize,
    });

    return result.context;
  }

  setSemanticCompressionEnabled(enabled: boolean): void {
    this.semanticCompressionEnabled = enabled;
  }

  async applySmartSort(): Promise<void> {
    const root = this.contextManager.getWorkspaceRoot();
    if (!root) { return; }

    const allFiles = await this.getAllProjectFiles(root);
    const filesWithContent = await this.collectAbsoluteFileContexts(allFiles);

    const { SmartFileSorter } = await import('../intelligence/SmartFileSorter.js');
    const sorter = new SmartFileSorter(root);
    const result = sorter.sort(filesWithContent, 'hybrid');

    this.checkedItems.clear();
    for (const file of result.sortedFiles) {
      this.checkedItems.add(file.relativePath);
    }

    this._onDidChangeTreeData.fire();
    vscode.window.showInformationMessage(`Sorted ${result.sortedFiles.length} files by dependency order.`);
  }

  async suggestRelevantFiles(): Promise<void> {
    const root = this.contextManager.getWorkspaceRoot();
    if (!root) { return; }

    const activeEditor = vscode.window.activeTextEditor;
    if (!activeEditor) {
      vscode.window.showWarningMessage('No active file. Please open a file first.');
      return;
    }

    // Read configuration
    const config = vscode.workspace.getConfiguration('llm-context-copy');
    const maxFiles = config.get<number>('suggestMaxFiles', 15);
    const weights = {
      activeEditor: config.get<number>('suggestWeights.activeEditor', 30),
      recentFiles: config.get<number>('suggestWeights.recentFiles', 20),
      dependencies: config.get<number>('suggestWeights.dependencies', 25),
      fileType: config.get<number>('suggestWeights.fileType', 15),
      pathSimilarity: config.get<number>('suggestWeights.pathSimilarity', 10),
      imports: config.get<number>('suggestWeights.imports', 15),
    };

    const allFiles = await this.getAllProjectFiles(root);
    const filesWithContent = await this.collectAbsoluteFileContexts(allFiles);

    const { ContextRelevanceScorer } = await import('../intelligence/ContextRelevanceScorer.js');
    const scorer = new ContextRelevanceScorer({ weights });

    // Build dependency graph and set it for the scorer
    const { DependencyGraphAnalyzer } = await import('../intelligence/DependencyGraph.js');
    const dependencyGraph = new DependencyGraphAnalyzer(root);
    await dependencyGraph.buildGraphForFiles(filesWithContent.map(f => f.path));
    scorer.setDependencyGraph(dependencyGraph, root);

    const scored = await scorer.scoreFiles(filesWithContent, root);
    const suggested = scorer.suggestFiles(scored, maxFiles);

    this.checkedItems.clear();
    for (const file of suggested) {
      this.checkedItems.add(file.relativePath);
    }

    this._onDidChangeTreeData.fire();
    vscode.window.showInformationMessage(`Suggested ${suggested.length} relevant files.`);
  }

  private semanticCompressionEnabled: boolean = false;
}

export class FileTreeItem extends vscode.TreeItem {
  constructor(
    public readonly id: string,
    public readonly itemData: TreeItemData,
    public readonly isChecked: boolean,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState
  ) {
    super(itemData.name, collapsibleState);

    if (this.tooltip === undefined) {
      if (itemData.tokenCount !== undefined) {
        this.tooltip = `${itemData.relativePath}\nRaw Tokens: ${itemData.tokenCount.toLocaleString()}`;
      } else {
        this.tooltip = itemData.relativePath;
      }
    }

    this.contextValue = itemData.type;

    if (itemData.tokenCount !== undefined) {
      this.description = this.formatNumber(itemData.tokenCount);
    } else if (itemData.size > 0) {
      this.description = this.formatNumber(itemData.size);
    }

    this.iconPath = itemData.type === 'file' ? new vscode.ThemeIcon('file') : new vscode.ThemeIcon('folder');
    this.checkboxState = isChecked ? vscode.TreeItemCheckboxState.Checked : vscode.TreeItemCheckboxState.Unchecked;

    if (itemData.type === 'file') {
      this.resourceUri = itemData.uri;
      this.command = {
        command: 'vscode.open',
        title: 'Open File',
        arguments: [itemData.uri],
      };
    }
  }

  private formatNumber(value: number): string {
    return value.toLocaleString();
  }
}
