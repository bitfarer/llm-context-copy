import { ProjectContext, FileContext, DirectoryStructure, FormatterOptions } from '../types';

export class ContextFormatter {
  private options: Required<FormatterOptions>;
  private toonCache: any = null;

  constructor(options: FormatterOptions) {
    this.options = {
      outputFormat: options.outputFormat || 'markdown',
      includeStats: options.includeStats ?? true,
      includeStructure: options.includeStructure ?? true,
      collapseEmptyLines: options.collapseEmptyLines ?? false,
    };
  }

  format(context: ProjectContext): string {
    if (context.files.length === 0) {
      return '';
    }

    switch (this.options.outputFormat) {
      case 'markdown':
        return this.formatMarkdown(context);
      case 'json':
        return this.formatJson(context);
      case 'plain':
        return this.formatPlain(context);
      case 'toon':
        return this.formatToon(context);
      default:
        return this.formatMarkdown(context);
    }
  }

  private formatMarkdown(context: ProjectContext): string {
    const lines: string[] = [];

    lines.push('# Project Context\n');

    if (this.options.includeStructure && context.structure) {
      lines.push(this.formatDirectoryStructure(context.structure));
      lines.push('');
    }

    if (this.options.includeStats) {
      lines.push(this.formatStats(context));
      lines.push('');
    }

    lines.push('---\n');

    for (const file of context.files) {
      lines.push(this.formatFile(file));
      lines.push('\n');
    }

    return lines.join('\n');
  }

  private formatFile(file: FileContext): string {
    const lines: string[] = [];
    const relativePath = file.relativePath.replace(/\\/g, '/');

    lines.push(`## File: ${relativePath}`);
    lines.push('');
    lines.push(`\`\`\`${file.language}`);

    let content = file.content;
    if (this.options.collapseEmptyLines) {
      content = content.replace(/\n\s*\n\s*\n+/g, '\n\n');
    }

    lines.push(content);
    lines.push('```');

    return lines.join('\n');
  }

  private formatDirectoryStructure(structure: DirectoryStructure): string {
    const lines: string[] = [];

    lines.push('## Directory Structure\n');
    lines.push('```\n');
    lines.push(this.renderStructureTree(structure, 0, true));
    lines.push('\n```\n');

    return lines.join('');
  }

  private renderStructureTree(structure: DirectoryStructure, depth: number, isLast: boolean): string {
    const lines: string[] = [];

    let prefix = '';
    if (depth > 0) {
      prefix += isLast ? '└── ' : '├── ';
    }

    const icon = structure.type === 'directory' ? '📁' : '📄';
    lines.push(prefix + icon + ' ' + structure.name);

    if (structure.children && structure.children.length > 0) {
      for (let i = 0; i < structure.children.length; i++) {
        const childIsLast = i === structure.children.length - 1;
        const childLines = this.renderStructureTree(structure.children[i], depth + 1, childIsLast);

        // Indent child lines with proper continuation characters
        const childIndent = depth > 0
          ? (isLast ? '    ' : '│   ')
          : '';

        const indentedLines = childLines
          .split('\n')
          .map(line => childIndent + line)
          .join('\n');

        lines.push(indentedLines);
      }
    }

    return lines.join('\n');
  }

  private formatStats(context: ProjectContext): string {
    const lines: string[] = [];
    const metadata = context.metadata;

    lines.push('## Statistics');
    lines.push('');
    lines.push(`- **Total Files:** ${metadata.totalFiles}`);
    lines.push(`- **Total Size:** ${this.formatSize(metadata.totalSize)}`);
    lines.push(`- **Output Format:** ${this.options.outputFormat.toUpperCase()}`);

    const originalTokens = metadata.originalTokenCount ?? metadata.tokenCount;
    const compressionRatio = originalTokens > 0
      ? ((metadata.tokenCount / originalTokens) * 100).toFixed(1)
      : '100.0';

    if (metadata.originalTokenCount && metadata.originalTokenCount !== metadata.tokenCount) {
      lines.push(
        `- **Estimated Tokens:** ~${metadata.tokenCount.toLocaleString()} / ${metadata.originalTokenCount.toLocaleString()} (${compressionRatio}%)`
      );
    } else {
      lines.push(
        `- **Estimated Tokens:** ~${metadata.tokenCount.toLocaleString()} ${this.options.outputFormat === 'markdown' ? 'tokens' : ''
        }`
      );
    }

    lines.push(`- **Generated At:** ${new Date(metadata.timestamp).toISOString()}`);

    return lines.join('\n');
  }

  private formatJson(context: ProjectContext): string {
    return JSON.stringify(context, null, 2);
  }

  private formatPlain(context: ProjectContext): string {
    const lines: string[] = [];

    if (this.options.includeStructure && context.structure) {
      lines.push('Directory Structure:');
      lines.push(this.plainStructureTree(context.structure));
      lines.push('');
    }

    for (const file of context.files) {
      lines.push(`File: ${file.relativePath}`);
      lines.push('='.repeat(60));
      lines.push(file.content);
      lines.push('');
    }

    return lines.join('\n');
  }

  private plainStructureTree(structure: DirectoryStructure, indent = ''): string {
    let output = indent + (structure.type === 'directory' ? '[DIR] ' : '[FILE] ') + structure.name + '\n';

    if (structure.children) {
      for (const child of structure.children) {
        output += this.plainStructureTree(child, indent + '  ');
      }
    }

    return output;
  }

  private formatSize(bytes: number): string {
    if (bytes < 1024) {
      return bytes + ' B';
    }
    if (bytes < 1024 * 1024) {
      return (bytes / 1024).toFixed(2) + ' KB';
    }
    if (bytes < 1024 * 1024 * 1024) {
      return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
    }
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
  }

  private formatToon(context: ProjectContext): string {
    try {
      if (!this.toonCache) {
        this.toonCache = require('@toon-format/toon');
      }
      const encode = this.toonCache.encode;

      if (!encode) {
        return this.formatFallbackToon(context);
      }

      const toonData: any = {};

      if (this.options.includeStats) {
        toonData.stats = {
          totalFiles: context.metadata.totalFiles,
          totalSize: context.metadata.totalSize,
          estimatedTokens: context.metadata.tokenCount,
          rootPath: context.metadata.rootPath,
          generatedAt: new Date(context.metadata.timestamp).toISOString(),
        };
      }

      if (this.options.includeStructure && context.structure) {
        toonData.structure = this.buildToonStructure(context.structure);
      }

      toonData.files = context.files.map((file) => {
        let content = file.content;
        if (this.options.collapseEmptyLines) {
          content = content.replace(/\n\s*\n\s*\n+/g, '\n\n');
        }
        return {
          path: file.relativePath.replace(/\\/g, '/'),
          language: file.language,
          size: file.stats.size,
          content,
        };
      });

      return encode(toonData, {
        indent: 2,
        delimiter: '\t',
        keyFolding: 'safe',
        flattenDepth: Infinity,
      });
    } catch (error) {
      console.error('TOON format error:', error);
      return this.formatFallbackToon(context);
    }
  }

  private formatFallbackToon(context: ProjectContext): string {
    const lines: string[] = [];
    lines.push('TOON Format (fallback due to missing @toon-format/toon package)');
    lines.push('');

    if (this.options.includeStats) {
      lines.push('stats:');
      const metadata = context.metadata;
      lines.push(`  totalFiles: ${metadata.totalFiles}`);
      lines.push(`  totalSize: ${metadata.totalSize}`);
      lines.push(`  estimatedTokens: ${metadata.tokenCount}`);
      lines.push(`  generatedAt: "${new Date(metadata.timestamp).toISOString()}"`);
      lines.push('');
    }

    lines.push(`files[${context.files.length}]{path,language,size,content}:`);

    const maxContentPreview = 200;
    for (const file of context.files) {
      let content = file.content;
      if (this.options.collapseEmptyLines) {
        content = content.replace(/\n\s*\n\s*\n+/g, '\n\n');
      }

      const safeContent = content.length > maxContentPreview
        ? content.substring(0, maxContentPreview) + '... (truncated)'
        : content;

      const safePath = file.relativePath.replace(/\\/g, '/');
      lines.push(`  "${safePath}\t${file.language}\t${file.stats.size}\t${safeContent.replace(/\n/g, '\\n').replace(/\t/g, '\\t')}"`);
    }

    return lines.join('\n');
  }

  private buildToonStructure(structure: DirectoryStructure): any {
    const result: any = {
      name: structure.name,
      type: structure.type,
    };

    if (structure.children && structure.children.length > 0) {
      result.children = structure.children.map((child) => this.buildToonStructure(child));
    }

    return result;
  }
}