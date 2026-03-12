import * as vscode from 'vscode';
import { ProjectContext, PreviewPanelOptions } from '../types';
import { ITokenCounter } from '../token/TokenCounter';
import { ContextFormatter } from '../formatters/ContextFormatter';

export interface PreviewContent {
  content: string;
  tokenCount: number;
  fileCount: number;
  formattedStats: string;
}

export class PreviewService {
  private formatter: ContextFormatter;
  private tokenCounter: ITokenCounter;

  constructor(
    tokenCounter: ITokenCounter,
    outputFormat: string = 'markdown'
  ) {
    this.tokenCounter = tokenCounter;
    this.formatter = new ContextFormatter({
      outputFormat: outputFormat as any,
      includeStats: true,
      includeStructure: false,
      collapseEmptyLines: false,
    });
  }

  generatePreview(context: ProjectContext): PreviewContent {
    const formattedContent = this.formatter.format(context);
    const tokenCount = this.tokenCounter.countProjectTokens(context);

    const statsLines = [
      `📊 **Files:** ${context.files.length}`,
      `📝 **Tokens:** ~${tokenCount.totalTokens.toLocaleString()}`,
      `📏 **Characters:** ${tokenCount.details.charCount.toLocaleString()}`,
      `📄 **Lines:** ${tokenCount.details.lineCount.toLocaleString()}`,
    ];

    return {
      content: formattedContent,
      tokenCount: tokenCount.totalTokens,
      fileCount: context.files.length,
      formattedStats: statsLines.join('  |  '),
    };
  }

  generateIncrementalPreview(
    context: ProjectContext,
    changeSummary: string
  ): PreviewContent {
    const basePreview = this.generatePreview(context);
    
    const header = `# 📋 Preview (with changes)\n\n${changeSummary}\n\n---\n\n`;
    const fullContent = header + basePreview.content;

    return {
      content: fullContent,
      tokenCount: basePreview.tokenCount,
      fileCount: basePreview.fileCount,
      formattedStats: basePreview.formattedStats,
    };
  }
}
