import * as vscode from 'vscode';
import { ProjectContext, FormatterOptions, CopyResult } from '../types';
import { ContextFormatter } from '../formatters/ContextFormatter';
import { ICompressionEngine, CompressionResult } from '../compression/CompressionEngine';
import { ITokenCounter, TokenCountResult } from '../token/TokenCounter';
import { ContextCopyError, ErrorHandler } from '../errors/ContextCopyError';
import { FormatComparator, FormatComparisonReport } from '../formatters/FormatComparator';

export interface CopyServiceOptions {
  formatterOptions: FormatterOptions;
  compressionEngine: ICompressionEngine;
  tokenCounter: ITokenCounter;
  errorHandler?: ErrorHandler;
}

export interface CopyOperationResult {
  success: boolean;
  result?: CopyResult;
  compressionResult?: CompressionResult;
  originalTokenCount?: TokenCountResult;
  formatComparison?: FormatComparisonReport;
  error?: ContextCopyError;
}

export class CopyService {
  private formatter: ContextFormatter;
  private compressionEngine: ICompressionEngine;
  private tokenCounter: ITokenCounter;
  private errorHandler: ErrorHandler;
  private formatComparator: FormatComparator;
  private outputFormat: FormatterOptions['outputFormat'];

  constructor(options: CopyServiceOptions) {
    this.formatter = new ContextFormatter(options.formatterOptions);
    this.compressionEngine = options.compressionEngine;
    this.tokenCounter = options.tokenCounter;
    this.errorHandler = options.errorHandler || new ErrorHandler();
    this.formatComparator = new FormatComparator(options.tokenCounter);
    this.outputFormat = options.formatterOptions.outputFormat;
  }

  async copyToClipboard(
    context: ProjectContext,
    strategyNames: string[] = [],
    withNotification = true
  ): Promise<CopyOperationResult> {
    const startTime = Date.now();

    try {
      const originalTokenCount = this.tokenCounter.countProjectTokens(context);

      let compressionResult: CompressionResult | undefined;
      let finalContext = context;

      if (strategyNames.length > 0) {
        compressionResult = await this.compressionEngine.compressWithStrategies(
          context,
          strategyNames
        );
        finalContext = compressionResult.context;
      }

      const formattedContent = this.formatter.format(finalContext);

      await vscode.env.clipboard.writeText(formattedContent);

      const duration = Date.now() - startTime;

      const copyResult: CopyResult = {
        success: true,
        content: formattedContent,
        tokenCount: compressionResult?.compressedTokens ?? originalTokenCount.totalTokens,
        fileCount: finalContext.files.length,
        optimizationsApplied: compressionResult ? [compressionResult.strategyName] : undefined,
        duration,
      };

      if (withNotification) {
        this.showSuccessNotification(copyResult, originalTokenCount, compressionResult);
      }

      return {
        success: true,
        result: copyResult,
        compressionResult,
        originalTokenCount,
      };
    } catch (error) {
      const contextError = this.errorHandler.handle(error, withNotification);
      return {
        success: false,
        error: contextError,
      };
    }
  }

  async previewContent(
    context: ProjectContext,
    strategyNames: string[] = []
  ): Promise<{
    formattedContent: string;
    originalTokenCount: TokenCountResult;
    compressionResult?: CompressionResult;
    formatComparison?: FormatComparisonReport;
  }> {
    const originalTokenCount = this.tokenCounter.countProjectTokens(context);

    let compressionResult: CompressionResult | undefined;
    let finalContext = context;

    if (strategyNames.length > 0) {
      compressionResult = await this.compressionEngine.compressWithStrategies(
        context,
        strategyNames
      );
      finalContext = compressionResult.context;
    }

    const formattedContent = this.formatter.format(finalContext);

    const formatComparison = this.formatComparator.compareAllFormats(finalContext);

    return {
      formattedContent,
      originalTokenCount,
      compressionResult,
      formatComparison,
    };
  }

  getCompressionEstimate(
    context: ProjectContext,
    strategyNames: string[]
  ): {
    originalTokens: number;
    estimatedTokens: number;
    savings: number;
    savingsPercentage: number;
  } {
    const originalTokenCount = this.tokenCounter.countProjectTokens(context);
    const estimate = this.compressionEngine.estimateCompression(context, strategyNames);

    const savings = originalTokenCount.totalTokens - estimate.estimatedTokens;
    const savingsPercentage = originalTokenCount.totalTokens > 0
      ? (savings / originalTokenCount.totalTokens) * 100
      : 0;

    return {
      originalTokens: originalTokenCount.totalTokens,
      estimatedTokens: estimate.estimatedTokens,
      savings,
      savingsPercentage,
    };
  }

  compareFormats(context: ProjectContext): FormatComparisonReport {
    return this.formatComparator.compareAllFormats(context);
  }

  getFormatEfficiency(format: string, tokenCount: number, baselineTokens: number): {
    rating: 'excellent' | 'good' | 'fair' | 'poor';
    efficiency: number;
    description: string;
  } {
    return this.formatComparator.getFormatEfficiencyRating(format, tokenCount, baselineTokens);
  }

  private showSuccessNotification(
    result: CopyResult,
    originalTokenCount: TokenCountResult,
    compressionResult?: CompressionResult
  ): void {
    const tokens = compressionResult?.compressedTokens ?? result.tokenCount;

    const message = `✓ ~${tokens.toLocaleString()} tokens | ${this.outputFormat.toUpperCase()}`;

    vscode.window.showInformationMessage(message);
  }
}