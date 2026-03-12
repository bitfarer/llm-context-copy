import { ProjectContext, FileContext } from '../types';

export interface CompressionResult {
  context: ProjectContext;
  strategyName: string;
  originalTokens: number;
  compressedTokens: number;
  compressionRatio: number;
  metadata: {
    filesProcessed: number;
    bytesSaved: number;
    durationMs: number;
  };
}

export interface ICompressionStrategy {
  readonly name: string;
  readonly description: string;
  isEnabled: boolean;
  apply(context: ProjectContext): Promise<ProjectContext>;
  estimateCompressionRatio(context: ProjectContext): number;
}

export abstract class BaseCompressionStrategy implements ICompressionStrategy {
  abstract readonly name: string;
  abstract readonly description: string;
  isEnabled = false;

  abstract apply(context: ProjectContext): Promise<ProjectContext>;

  estimateCompressionRatio(_context: ProjectContext): number {
    return 1.0;
  }

  protected createFileContext(file: FileContext, newContent: string): FileContext {
    return {
      ...file,
      content: newContent,
      stats: {
        ...file.stats,
        size: Buffer.byteLength(newContent, 'utf-8'),
      },
    };
  }
}

/**
 * Reduces 3+ consecutive empty lines down to a single empty line.
 * Input:  "line1\n\n\n\nline2"  (4 newlines = 3 empty lines between)
 * Output: "line1\n\nline2"      (2 newlines = 1 empty line between)
 */
export class RemoveEmptyLinesStrategy extends BaseCompressionStrategy {
  readonly name = 'removeEmptyLines';
  readonly description = 'Remove consecutive empty lines (keep at most one)';
  isEnabled = true;

  async apply(context: ProjectContext): Promise<ProjectContext> {
    const optimizedFiles = context.files.map(file => {
      // Replace 3+ consecutive newlines (possibly with whitespace between) with exactly 2 newlines
      const newContent = file.content.replace(/(\n\s*\n)\s*\n+/g, '\n\n');
      return this.createFileContext(file, newContent);
    });

    return { ...context, files: optimizedFiles };
  }

  estimateCompressionRatio(context: ProjectContext): number {
    let totalEmptyLines = 0;
    let totalLines = 0;

    for (const file of context.files) {
      const lines = file.content.split('\n');
      totalLines += lines.length;

      let consecutiveEmpty = 0;
      for (const line of lines) {
        if (line.trim() === '') {
          consecutiveEmpty++;
          if (consecutiveEmpty > 2) {
            totalEmptyLines++;
          }
        } else {
          consecutiveEmpty = 0;
        }
      }
    }

    return totalLines > 0 ? 1 - (totalEmptyLines * 0.5 / totalLines) : 1.0;
  }
}

export class RemoveCommentsStrategy extends BaseCompressionStrategy {
  readonly name = 'removeComments';
  readonly description = 'Remove single-line and multi-line comments';
  isEnabled = false;

  private commentPatterns = [
    { pattern: /\/\*[\s\S]*?\*\//g, name: 'block' },
    { pattern: /\/\/.*$/gm, name: 'line' },
    { pattern: /#.*$/gm, name: 'hash' },
    { pattern: /<!--[\s\S]*?-->/g, name: 'html' },
  ];

  async apply(context: ProjectContext): Promise<ProjectContext> {
    const optimizedFiles = context.files.map(file => {
      let content = file.content;

      for (const { pattern } of this.commentPatterns) {
        content = content.replace(pattern, '');
      }

      return this.createFileContext(file, content);
    });

    return { ...context, files: optimizedFiles };
  }

  estimateCompressionRatio(context: ProjectContext): number {
    let commentChars = 0;
    let totalChars = 0;

    for (const file of context.files) {
      totalChars += file.content.length;
      const content = file.content;

      for (const { pattern } of this.commentPatterns) {
        const matches = content.match(pattern);
        if (matches) {
          commentChars += matches.reduce((sum, m) => sum + m.length, 0);
        }
      }
    }

    return totalChars > 0 ? 1 - (commentChars / totalChars * 0.8) : 1.0;
  }
}

export class MinifyWhitespaceStrategy extends BaseCompressionStrategy {
  readonly name = 'minifyWhitespace';
  readonly description = 'Minify whitespace and indentation';
  isEnabled = false;

  async apply(context: ProjectContext): Promise<ProjectContext> {
    const optimizedFiles = context.files.map(file => {
      const lines = file.content.split('\n');
      const nonEmptyLines = lines.filter(line => line.trim().length > 0);
      const minifiedContent = nonEmptyLines.map(l => l.trim()).join(' ');

      return this.createFileContext(file, minifiedContent);
    });

    return { ...context, files: optimizedFiles };
  }

  estimateCompressionRatio(context: ProjectContext): number {
    let whitespaceChars = 0;
    let totalChars = 0;

    for (const file of context.files) {
      totalChars += file.content.length;
      whitespaceChars += (file.content.match(/\s/g) || []).length;
    }

    return totalChars > 0 ? 1 - (whitespaceChars / totalChars * 0.7) : 1.0;
  }
}

export class TruncateLongFilesStrategy extends BaseCompressionStrategy {
  readonly name = 'truncateLongFiles';
  readonly description = 'Truncate files larger than specified limit';
  isEnabled = false;

  private readonly maxLines: number;

  constructor(maxLines = 100) {
    super();
    this.maxLines = maxLines;
  }

  async apply(context: ProjectContext): Promise<ProjectContext> {
    const optimizedFiles = context.files.map(file => {
      const lines = file.content.split('\n');

      if (lines.length <= this.maxLines) {
        return file;
      }

      const headCount = this.maxLines - 10;
      const truncatedContent = [
        ...lines.slice(0, headCount),
        '',
        '// ... (truncated)',
        '',
        ...lines.slice(-10),
      ].join('\n');

      return this.createFileContext(file, truncatedContent);
    });

    return { ...context, files: optimizedFiles };
  }

  estimateCompressionRatio(context: ProjectContext): number {
    let truncatedLines = 0;
    let totalLines = 0;

    for (const file of context.files) {
      const lines = file.content.split('\n');
      totalLines += lines.length;

      if (lines.length > this.maxLines) {
        truncatedLines += lines.length - this.maxLines;
      }
    }

    return totalLines > 0 ? 1 - (truncatedLines / totalLines) : 1.0;
  }
}

export class DeduplicateCodeStrategy extends BaseCompressionStrategy {
  readonly name = 'deduplicateCode';
  readonly description = 'Identify and remove duplicate code blocks';
  isEnabled = false;

  async apply(context: ProjectContext): Promise<ProjectContext> {
    const seenBlocks = new Set<string>();

    const optimizedFiles = context.files.map(file => {
      const lines = file.content.split('\n');
      const filteredLines: string[] = [];
      const currentBlock: string[] = [];
      let inCodeBlock = false;

      for (const line of lines) {
        const trimmed = line.trim();

        if (this.isCodeLine(trimmed)) {
          currentBlock.push(line);
          inCodeBlock = true;
        } else {
          if (inCodeBlock && currentBlock.length > 0) {
            const blockKey = currentBlock.map(l => l.trim()).join('\n');

            if (!seenBlocks.has(blockKey)) {
              seenBlocks.add(blockKey);
              filteredLines.push(...currentBlock);
            }

            currentBlock.length = 0;
            inCodeBlock = false;
          }

          filteredLines.push(line);
        }
      }

      // Flush remaining block
      if (currentBlock.length > 0) {
        const blockKey = currentBlock.map(l => l.trim()).join('\n');
        if (!seenBlocks.has(blockKey)) {
          seenBlocks.add(blockKey);
          filteredLines.push(...currentBlock);
        }
      }

      return this.createFileContext(file, filteredLines.join('\n'));
    });

    return { ...context, files: optimizedFiles };
  }

  private isCodeLine(line: string): boolean {
    return line.length > 0 && !line.startsWith('//') && !line.startsWith('#') && !line.startsWith('/*');
  }

  estimateCompressionRatio(_context: ProjectContext): number {
    return 0.95;
  }
}

export class PrioritizeImportantFilesStrategy extends BaseCompressionStrategy {
  readonly name = 'prioritizeImportantFiles';
  readonly description = 'Prioritize important files and reduce less important ones';
  isEnabled = false;

  private readonly totalBudget: number;

  constructor(totalBudget = 100000) {
    super();
    this.totalBudget = totalBudget;
  }

  async apply(context: ProjectContext): Promise<ProjectContext> {
    const sortedFiles = [...context.files].sort((a, b) => this.importanceScore(b) - this.importanceScore(a));

    const highPriorityFiles = sortedFiles.filter(file => this.importanceScore(file) >= 8);

    let currentSize = 0;
    const optimizedFiles: FileContext[] = [];

    for (const file of highPriorityFiles) {
      optimizedFiles.push(file);
      currentSize += file.content.length;
    }

    for (const file of sortedFiles) {
      if (highPriorityFiles.includes(file)) {
        continue;
      }

      if (currentSize + file.content.length <= this.totalBudget) {
        optimizedFiles.push(file);
        currentSize += file.content.length;
      } else {
        const availableSpace = this.totalBudget - currentSize;
        if (availableSpace > 100) {
          const truncatedContent = file.content.substring(0, availableSpace) + '\n// ... (truncated)';
          optimizedFiles.push(this.createFileContext(file, truncatedContent));
          currentSize = this.totalBudget;
        }
        break;
      }
    }

    return { ...context, files: optimizedFiles };
  }

  private importanceScore(file: FileContext): number {
    const name = file.relativePath.toLowerCase();
    let score = 0;

    if (name.includes('index') || name.includes('main') || name.includes('app')) {
      score += 10;
    }

    if (name.endsWith('.ts') || name.endsWith('.tsx') || name.endsWith('.js') || name.endsWith('.jsx')) {
      score += 5;
    }

    if (name.includes('test') || name.includes('spec') || name.includes('.test.') || name.includes('.spec.')) {
      score -= 5;
    }

    if (name.includes('node_modules') || name.includes('dist') || name.includes('build')) {
      score -= 20;
    }

    if (file.stats.size > 50000) {
      score -= 3;
    }

    return score;
  }

  estimateCompressionRatio(context: ProjectContext): number {
    const totalSize = context.files.reduce((sum, f) => sum + f.content.length, 0);
    return totalSize > this.totalBudget ? this.totalBudget / totalSize : 1.0;
  }
}