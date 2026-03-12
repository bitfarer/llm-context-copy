import * as vscode from 'vscode';
import { TokenBudgetConfig, TokenBudgetResult, FileContext } from '../types';
import { ITokenCounter } from '../token/TokenCounter';

interface FileWithTokens {
  path: string;
  tokens: number;
  priority: number;
}

export class TokenBudgetManager {
  private config: TokenBudgetConfig;

  constructor(
    private tokenCounter: ITokenCounter,
    config?: Partial<TokenBudgetConfig>
  ) {
    this.config = {
      maxTokens: config?.maxTokens ?? 128000,
      priorityFiles: config?.priorityFiles ?? [],
      excludedPatterns: config?.excludedPatterns ?? ['node_modules', '.git', 'dist', 'build'],
      autoSelect: config?.autoSelect ?? true,
      compressionPriority: config?.compressionPriority ?? [
        'truncateLongFiles',
        'removeComments',
        'removeEmptyLines',
        'minifyWhitespace',
      ],
    };
  }

  updateConfig(config: Partial<TokenBudgetConfig>): void {
    this.config = { ...this.config, ...config };
  }

  getConfig(): TokenBudgetConfig {
    return { ...this.config };
  }

  async calculateOptimalSelection(
    files: FileContext[],
    targetTokens?: number
  ): Promise<TokenBudgetResult> {
    const maxTokens = targetTokens ?? this.config.maxTokens;
    const filesWithTokens: FileWithTokens[] = files.map(file => ({
      path: file.relativePath,
      tokens: this.tokenCounter.countTokens(file.content),
      priority: this.getFilePriority(file.relativePath),
    }));

    filesWithTokens.sort((a, b) => {
      if (a.priority !== b.priority) {
        return b.priority - a.priority;
      }
      return a.tokens - b.tokens;
    });

    const selectedFiles: string[] = [];
    let totalTokens = 0;
    const recommendations: string[] = [];

    for (const file of filesWithTokens) {
      if (this.isExcluded(file.path)) {
        recommendations.push(`Excluded: ${file.path}`);
        continue;
      }

      if (totalTokens + file.tokens <= maxTokens) {
        selectedFiles.push(file.path);
        totalTokens += file.tokens;
      } else {
        const remaining = maxTokens - totalTokens;
        if (remaining > 100 && file.tokens > maxTokens * 0.5) {
          recommendations.push(
            `Consider enabling compression for: ${file.path} (${file.tokens} tokens)`
          );
        }
      }
    }

    const withinBudget = totalTokens <= maxTokens;

    if (!withinBudget) {
      recommendations.push(
        `Warning: ${files.length - selectedFiles.length} files exceed token budget`
      );
    }

    if (selectedFiles.length === 0 && files.length > 0) {
      recommendations.push(
        `All files exceed the ${maxTokens} token budget. Consider reducing file count or using compression.`
      );
    }

    return {
      selectedFiles,
      estimatedTokens: totalTokens,
      withinBudget,
      recommendations,
    };
  }

  private getFilePriority(filePath: string): number {
    const normalizedPath = filePath.toLowerCase();
    const priorityExtensions: Record<string, number> = {
      '.ts': 10,
      '.tsx': 10,
      '.js': 9,
      '.jsx': 9,
      '.py': 8,
      '.java': 8,
      '.go': 8,
      '.rs': 8,
      '.json': 5,
      '.yaml': 5,
      '.yml': 5,
      '.md': 3,
    };

    const ext = normalizedPath.substring(normalizedPath.lastIndexOf('.'));
    let priority = priorityExtensions[ext] ?? 5;

    if (this.config.priorityFiles.some(p => normalizedPath.includes(p.toLowerCase()))) {
      priority += 20;
    }

    const importantPatterns = [
      'src/', 'lib/', 'app/', 'core/', 'main.',
      'index.', 'entry.', 'config.', 'service.',
    ];

    for (const pattern of importantPatterns) {
      if (normalizedPath.includes(pattern)) {
        priority += 5;
        break;
      }
    }

    const lowPriorityPatterns = [
      'test/', 'spec/', '__tests__/', 'node_modules/',
      'dist/', 'build/', '.min.', '.d.ts',
    ];

    for (const pattern of lowPriorityPatterns) {
      if (normalizedPath.includes(pattern)) {
        priority -= 10;
        break;
      }
    }

    return priority;
  }

  private isExcluded(filePath: string): boolean {
    const normalizedPath = filePath.replace(/\\/g, '/').toLowerCase();
    
    return this.config.excludedPatterns.some(pattern => {
      const normalizedPattern = pattern.toLowerCase();
      
      if (normalizedPattern.endsWith('/')) {
        const dirName = normalizedPattern.slice(0, -1);
        return normalizedPath.includes('/' + dirName + '/') 
          || normalizedPath.startsWith(dirName + '/')
          || normalizedPath.endsWith('/' + dirName)
          || normalizedPath === dirName;
      }
      
      return normalizedPath.includes(normalizedPattern);
    });
  }

  suggestCompressionStrategies(
    currentTokens: number,
    targetTokens: number
  ): string[] {
    const ratio = currentTokens / targetTokens;
    const suggestions: string[] = [];

    if (ratio > 1.5) {
      suggestions.push(
        'truncateLongFiles',
        'removeComments',
        'minifyWhitespace'
      );
    } else if (ratio > 1.2) {
      suggestions.push(
        'removeComments',
        'removeEmptyLines'
      );
    } else if (ratio > 1.05) {
      suggestions.push('removeEmptyLines');
    }

    return suggestions;
  }

  async analyzeBudgetUsage(
    files: FileContext[]
  ): Promise<{
    totalTokens: number;
    byCategory: Record<string, number>;
    suggestions: string[];
  }> {
    const categories: Record<string, number> = {
      source: 0,
      config: 0,
      tests: 0,
      docs: 0,
      other: 0,
    };

    let totalTokens = 0;

    for (const file of files) {
      const tokens = this.tokenCounter.countTokens(file.content);
      const category = this.categorizeFile(file.relativePath);
      categories[category] += tokens;
      totalTokens += tokens;
    }

    const suggestions: string[] = [];

    if (categories.tests > totalTokens * 0.3) {
      suggestions.push('Consider excluding test files to save tokens');
    }

    if (categories.docs > totalTokens * 0.2) {
      suggestions.push('Consider excluding documentation files');
    }

    if (categories.other > totalTokens * 0.1) {
      suggestions.push('Review excluded patterns - some unexpected files are included');
    }

    return {
      totalTokens,
      byCategory: categories,
      suggestions,
    };
  }

  private categorizeFile(filePath: string): string {
    const normalizedPath = filePath.toLowerCase();

    const sourceExts = ['.ts', '.tsx', '.js', '.jsx', '.py', '.java', '.go', '.rs', '.cpp', '.c'];
    const testPatterns = ['test/', 'spec/', '__tests__/', '.test.', '.spec.'];
    const docPatterns = ['.md', '.txt', '.rst', '.doc'];
    const configPatterns = ['.json', '.yaml', '.yml', '.toml', '.ini', '.conf'];

    for (const ext of sourceExts) {
      if (normalizedPath.endsWith(ext)) {
        for (const pattern of testPatterns) {
          if (normalizedPath.includes(pattern)) {
            return 'tests';
          }
        }
        return 'source';
      }
    }

    for (const pattern of testPatterns) {
      if (normalizedPath.includes(pattern)) {
        return 'tests';
      }
    }

    for (const pattern of docPatterns) {
      if (normalizedPath.includes(pattern)) {
        return 'docs';
      }
    }

    for (const pattern of configPatterns) {
      if (normalizedPath.includes(pattern)) {
        return 'config';
      }
    }

    return 'other';
  }
}
