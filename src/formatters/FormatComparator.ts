import { ProjectContext } from '../types';
import { ITokenCounter } from '../token/TokenCounter';
import { ContextFormatter } from './ContextFormatter';

export interface FormatComparisonResult {
  format: 'markdown' | 'json' | 'plain' | 'toon';
  content: string;
  tokenCount: number;
  charCount: number;
  lineCount: number;
  sizeBytes: number;
}

export interface FormatComparisonReport {
  results: FormatComparisonResult[];
  mostEfficient: FormatComparisonResult;
  savings: Array<{
    format: string;
    tokensSaved: number;
    percentage: number;
  }>;
}

export class FormatComparator {
  private tokenCounter: ITokenCounter;

  constructor(tokenCounter: ITokenCounter) {
    this.tokenCounter = tokenCounter;
  }

  compareAllFormats(context: ProjectContext): FormatComparisonReport {
    const formats: Array<'markdown' | 'json' | 'plain' | 'toon'> = ['markdown', 'json', 'plain', 'toon'];
    const results: FormatComparisonResult[] = [];

    for (const format of formats) {
      const formatter = new ContextFormatter({
        outputFormat: format,
        includeStats: true,
        includeStructure: true,
        collapseEmptyLines: false,
      });

      const content = formatter.format(context);
      const tokenCount = this.tokenCounter.countTokens(content);

      results.push({
        format,
        content,
        tokenCount,
        charCount: content.length,
        lineCount: content.split('\n').length,
        sizeBytes: Buffer.byteLength(content, 'utf-8'),
      });
    }

    const mostEfficient = results.reduce((min, current) =>
      current.tokenCount < min.tokenCount ? current : min
    );

    const savings = results.map(result => ({
      format: result.format,
      tokensSaved: mostEfficient.tokenCount - result.tokenCount,
      percentage: result.tokenCount > 0
        ? ((result.tokenCount - mostEfficient.tokenCount) / result.tokenCount) * 100
        : 0,
    }));

    return {
      results,
      mostEfficient,
      savings,
    };
  }

  getFormatEfficiencyRating(format: string, tokenCount: number, baselineTokens: number): {
    rating: 'excellent' | 'good' | 'fair' | 'poor';
    efficiency: number;
    description: string;
  } {
    const efficiency = baselineTokens > 0 ? (tokenCount / baselineTokens) * 100 : 100;

    if (efficiency <= 70) {
      return {
        rating: 'excellent',
        efficiency,
        description: '非常高效，显著减少token使用',
      };
    } else if (efficiency <= 85) {
      return {
        rating: 'good',
        efficiency,
        description: '良好，有一定优化效果',
      };
    } else if (efficiency <= 95) {
      return {
        rating: 'fair',
        efficiency,
        description: '一般，优化效果有限',
      };
    } else {
      return {
        rating: 'poor',
        efficiency,
        description: '效率较低，建议使用其他格式',
      };
    }
  }
}
