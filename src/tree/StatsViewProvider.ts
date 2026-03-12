import * as vscode from 'vscode';
import { ContextManager } from '../services/ContextManager';
import { ITokenCounter } from '../token/TokenCounter';

interface StatsData {
  selectedFiles: number;
  totalSize: number;
  estimatedTokens: number;
  activeStrategies: string[];
  outputFormat: string;
}

interface StrategyOption {
  id: string;
  displayName: string;
  description: string;
  icon: string;
}

interface FormatOption {
  id: string;
  displayName: string;
  description: string;
  icon: string;
}

const STRATEGY_OPTIONS: StrategyOption[] = [
  { id: 'removeEmptyLines', displayName: 'Remove Empty Lines', description: 'Remove unnecessary blank lines', icon: 'fold' },
  { id: 'removeComments', displayName: 'Remove Comments', description: 'Strip code comments', icon: 'comment' },
  { id: 'minifyWhitespace', displayName: 'Minify Whitespace', description: 'Compress whitespace', icon: 'whitespace' },
  { id: 'truncateLongFiles', displayName: 'Truncate Long Files', description: 'Limit file length', icon: 'fold-down' },
  { id: 'deduplicateCode', displayName: 'Deduplicate Code', description: 'Remove duplicate blocks', icon: 'diff' },
  { id: 'prioritizeImportantFiles', displayName: 'Prioritize Important', description: 'Focus on key files', icon: 'star' },
];

const FORMAT_OPTIONS: FormatOption[] = [
  { id: 'markdown', displayName: 'Markdown', description: 'Standard markdown format', icon: 'markdown' },
  { id: 'json', displayName: 'JSON', description: 'Structured JSON output', icon: 'bracket' },
  { id: 'plain', displayName: 'Plain Text', description: 'Simple text format', icon: 'file-text' },
  { id: 'toon', displayName: 'TOON', description: 'Token-optimized format', icon: 'symbol-namespace' },
];

export class StatsViewProvider implements vscode.TreeDataProvider<StatsItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<StatsItem | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private currentStats: StatsData = {
    selectedFiles: 0,
    totalSize: 0,
    estimatedTokens: 0,
    activeStrategies: [],
    outputFormat: 'markdown',
  };

  private _onDidChangeStats = new vscode.EventEmitter<StatsData>();
  readonly onDidChangeStats = this._onDidChangeStats.event;

  constructor(
    private contextManager: ContextManager,
    private tokenCounter: ITokenCounter
  ) {}

  refresh(stats: StatsData): void {
    this.currentStats = stats;
    this._onDidChangeTreeData.fire();
    this._onDidChangeStats.fire(stats);

    vscode.commands.executeCommand(
      'setContext',
      'llmContextCopy:selectedCount',
      stats.selectedFiles
    );
  }

  getStats(): StatsData {
    return { ...this.currentStats };
  }

  getTreeItem(element: StatsItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: StatsItem): StatsItem[] {
    if (element) {
      if (element.contextValue === 'strategies') {
        return this.getStrategyItems();
      }
      if (element.contextValue === 'format') {
        return this.getFormatItems();
      }
      return [];
    }

    return this.getRootItems();
  }

  private getRootItems(): StatsItem[] {
    const items: StatsItem[] = [];

    items.push(this.createSummaryItem());

    items.push(this.createClickableItem(
      'Output Format',
      this.getFormatDisplayName(this.currentStats.outputFormat),
      'format',
      'file-code',
      'Click to change output format'
    ));

    items.push(this.createClickableItem(
      'Compression',
      this.getStrategiesSummary(),
      'strategies',
      'settings-gear',
      'Click to toggle compression strategies'
    ));

    return items;
  }

  private createSummaryItem(): StatsItem {
    const fileText = this.currentStats.selectedFiles === 1 ? 'file' : 'files';
    const tokenText = this.formatTokenCount(this.currentStats.estimatedTokens);
    const sizeText = this.formatBytes(this.currentStats.totalSize);
    const description = `${this.currentStats.selectedFiles} ${fileText} | ${tokenText} | ${sizeText}`;

    const item = new StatsItem(
      'Selection Summary',
      description,
      'summary',
      vscode.TreeItemCollapsibleState.None
    );

    item.tooltip = `Selected: ${this.currentStats.selectedFiles} files\nEstimated Tokens: ${this.currentStats.estimatedTokens.toLocaleString()}\nTotal Size: ${this.formatBytes(this.currentStats.totalSize)}`;
    item.iconPath = new vscode.ThemeIcon('info');

    return item;
  }

  private createClickableItem(
    label: string,
    description: string,
    contextValue: string,
    icon: string,
    tooltip: string
  ): StatsItem {
    const item = new StatsItem(
      label,
      description,
      contextValue,
      vscode.TreeItemCollapsibleState.None
    );
    item.tooltip = tooltip;
    item.iconPath = new vscode.ThemeIcon(icon);
    item.command = {
      command: `llm-context-copy.stats.${contextValue}`,
      title: `Select ${label}`,
      arguments: [],
    };

    return item;
  }

  private getStrategyItems(): StatsItem[] {
    return STRATEGY_OPTIONS.map(strategy => {
      const isActive = this.currentStats.activeStrategies.includes(strategy.id);
      const item = new StatsItem(
        strategy.displayName,
        isActive ? '✓ Active' : 'Inactive',
        `strategy-${strategy.id}`,
        vscode.TreeItemCollapsibleState.None
      );

      item.iconPath = new vscode.ThemeIcon(isActive ? 'check' : 'circle-outline');
      item.tooltip = `${strategy.description}\n\nClick to ${isActive ? 'disable' : 'enable'}`;
      item.command = {
        command: 'llm-context-copy.stats.toggleStrategy',
        title: 'Toggle Strategy',
        arguments: [strategy.id],
      };

      return item;
    });
  }

  private getFormatItems(): StatsItem[] {
    return FORMAT_OPTIONS.map(format => {
      const isActive = this.currentStats.outputFormat === format.id;
      const item = new StatsItem(
        format.displayName,
        isActive ? '✓ Selected' : format.description,
        `format-${format.id}`,
        vscode.TreeItemCollapsibleState.None
      );

      item.iconPath = new vscode.ThemeIcon(isActive ? 'check' : format.icon);
      item.tooltip = `${format.description}\n\nClick to select`;
      item.command = {
        command: 'llm-context-copy.stats.setFormat',
        title: 'Set Format',
        arguments: [format.id],
      };

      return item;
    });
  }

  private getFormatDisplayName(format: string): string {
    const option = FORMAT_OPTIONS.find(f => f.id === format);
    return option ? option.displayName : format.toUpperCase();
  }

  private getStrategiesSummary(): string {
    const count = this.currentStats.activeStrategies.length;
    if (count === 0) {
      return 'None';
    }
    return `${count} ${count === 1 ? 'strategy' : 'strategies'} active`;
  }

  private formatTokenCount(tokens: number): string {
    if (tokens >= 1000000) {
      return `${(tokens / 1000000).toFixed(1)}M tokens`;
    }
    if (tokens >= 1000) {
      return `${(tokens / 1000).toFixed(1)}K tokens`;
    }
    return `${tokens} tokens`;
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) { return '0 B'; }
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  static getStrategyOptions(): StrategyOption[] {
    return STRATEGY_OPTIONS;
  }

  static getFormatOptions(): FormatOption[] {
    return FORMAT_OPTIONS;
  }
}

class StatsItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly description: string,
    public readonly contextValue: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState
  ) {
    super(label, collapsibleState);
  }
}
