import { FileContext, ProjectContext } from '../types';

export interface TokenCountResult {
  totalTokens: number;
  fileTokens: Map<string, number>;
  details: {
    charCount: number;
    wordCount: number;
    lineCount: number;
  };
}

export interface ITokenCounter {
  countTokens(text: string): number;
  estimateTokensFromBytes(byteLength: number): number;
  countFileTokens(file: FileContext): number;
  countProjectTokens(context: ProjectContext): TokenCountResult;
}

export class TokenCounter implements ITokenCounter {
  private readonly charsPerToken: number;

  constructor(charsPerToken: number = 4) {
    this.charsPerToken = charsPerToken;
  }

  countTokens(text: string): number {
    if (!text || text.length === 0) {
      return 0;
    }
    const byteLength = Buffer.byteLength(text, 'utf-8');
    return this.estimateTokensFromBytes(byteLength);
  }

  estimateTokensFromBytes(byteLength: number): number {
    if (byteLength <= 0) {
      return 0;
    }
    return Math.ceil(byteLength / this.charsPerToken);
  }

  countFileTokens(file: FileContext): number {
    return this.countTokens(file.content);
  }

  countProjectTokens(context: ProjectContext): TokenCountResult {
    const fileTokens = new Map<string, number>();
    let totalTokens = 0;
    let totalChars = 0;
    let totalWords = 0;
    let totalLines = 0;

    for (const file of context.files) {
      const tokens = this.countFileTokens(file);
      fileTokens.set(file.relativePath, tokens);
      totalTokens += tokens;
      totalChars += file.content.length;
      totalWords += file.content.split(/\s+/).filter(w => w.length > 0).length;
      totalLines += file.content.split('\n').length;
    }

    return {
      totalTokens,
      fileTokens,
      details: {
        charCount: totalChars,
        wordCount: totalWords,
        lineCount: totalLines,
      },
    };
  }
}

export class TokenCounterFactory {
  static createDefault(): ITokenCounter {
    return new TokenCounter(4);
  }

  static createForModel(modelName: string): ITokenCounter {
    const charsPerToken = this.getCharsPerTokenForModel(modelName);
    return new TokenCounter(charsPerToken);
  }

  private static getCharsPerTokenForModel(modelName: string): number {
    const modelLower = modelName.toLowerCase();

    if (modelLower.includes('gpt-4') || modelLower.includes('claude')) {
      return 4;
    }
    if (modelLower.includes('gpt-3.5')) {
      return 4.5;
    }
    if (modelLower.includes('llama') || modelLower.includes('codellama')) {
      return 3.5;
    }

    return 4;
  }
}
