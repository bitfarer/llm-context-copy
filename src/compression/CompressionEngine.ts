import { ProjectContext } from '../types';
import { ICompressionStrategy, CompressionResult } from './CompressionStrategy';
import { ITokenCounter } from '../token/TokenCounter';

export { CompressionResult } from './CompressionStrategy';

export interface CompressionEngineOptions {
  targetTokenLimit?: number;
  preserveComments?: boolean;
  preserveImports?: boolean;
}

export interface ICompressionEngine {
  registerStrategy(strategy: ICompressionStrategy): void;
  unregisterStrategy(name: string): boolean;
  toggleStrategy(name: string, enabled: boolean): boolean;
  getStrategies(): ICompressionStrategy[];
  compress(context: ProjectContext): Promise<CompressionResult>;
  compressWithStrategies(context: ProjectContext, strategyNames: string[]): Promise<CompressionResult>;
  estimateCompression(context: ProjectContext, strategyNames: string[]): CompressionEstimate;
}

export interface CompressionEstimate {
  originalTokens: number;
  estimatedTokens: number;
  estimatedRatio: number;
  strategies: Array<{
    name: string;
    estimatedRatio: number;
  }>;
}

export class CompressionEngine implements ICompressionEngine {
  private strategies: Map<string, ICompressionStrategy>;
  private tokenCounter: ITokenCounter;

  constructor(tokenCounter: ITokenCounter, _options: CompressionEngineOptions = {}) {
    this.strategies = new Map();
    this.tokenCounter = tokenCounter;
  }

  registerStrategy(strategy: ICompressionStrategy): void {
    this.strategies.set(strategy.name, strategy);
  }

  unregisterStrategy(name: string): boolean {
    return this.strategies.delete(name);
  }

  toggleStrategy(name: string, enabled: boolean): boolean {
    const strategy = this.strategies.get(name);
    if (strategy) {
      strategy.isEnabled = enabled;
      return true;
    }
    return false;
  }

  getStrategies(): ICompressionStrategy[] {
    return Array.from(this.strategies.values());
  }

  async compress(context: ProjectContext): Promise<CompressionResult> {
    const enabledStrategies = this.getEnabledStrategies();
    return this.compressWithStrategies(context, enabledStrategies.map(s => s.name));
  }

  async compressWithStrategies(
    context: ProjectContext,
    strategyNames: string[]
  ): Promise<CompressionResult> {
    const startTime = Date.now();
    const originalTokenCount = this.tokenCounter.countProjectTokens(context);

    let optimizedContext = context;
    const appliedStrategies: string[] = [];

    for (const name of strategyNames) {
      const strategy = this.strategies.get(name);
      if (strategy) {
        try {
          optimizedContext = await strategy.apply(optimizedContext);
          appliedStrategies.push(name);
        } catch (error) {
          console.error(`Error applying strategy ${name}:`, error);
        }
      }
    }

    const compressedTokenCount = this.tokenCounter.countProjectTokens(optimizedContext);
    const duration = Date.now() - startTime;

    const originalSize = context.files.reduce((sum, f) => sum + f.stats.size, 0);
    const compressedSize = optimizedContext.files.reduce((sum, f) => sum + f.stats.size, 0);

    return {
      context: optimizedContext,
      strategyName: appliedStrategies.join(', '),
      originalTokens: originalTokenCount.totalTokens,
      compressedTokens: compressedTokenCount.totalTokens,
      compressionRatio: originalTokenCount.totalTokens > 0
        ? compressedTokenCount.totalTokens / originalTokenCount.totalTokens
        : 1.0,
      metadata: {
        filesProcessed: optimizedContext.files.length,
        bytesSaved: originalSize - compressedSize,
        durationMs: duration,
      },
    };
  }

  estimateCompression(context: ProjectContext, strategyNames: string[]): CompressionEstimate {
    const originalTokenCount = this.tokenCounter.countProjectTokens(context);
    let estimatedTokens = originalTokenCount.totalTokens;
    const strategyEstimates: Array<{ name: string; estimatedRatio: number }> = [];

    for (const name of strategyNames) {
      const strategy = this.strategies.get(name);
      if (strategy) {
        const ratio = strategy.estimateCompressionRatio(context);
        strategyEstimates.push({ name, estimatedRatio: ratio });
        estimatedTokens = Math.floor(estimatedTokens * ratio);
      }
    }

    return {
      originalTokens: originalTokenCount.totalTokens,
      estimatedTokens,
      estimatedRatio: originalTokenCount.totalTokens > 0
        ? estimatedTokens / originalTokenCount.totalTokens
        : 1.0,
      strategies: strategyEstimates,
    };
  }

  private getEnabledStrategies(): ICompressionStrategy[] {
    return Array.from(this.strategies.values()).filter(s => s.isEnabled);
  }
}

export class CompressionEngineBuilder {
  private tokenCounter: ITokenCounter;
  private strategies: ICompressionStrategy[] = [];
  private options: CompressionEngineOptions = {};

  constructor(tokenCounter: ITokenCounter) {
    this.tokenCounter = tokenCounter;
  }

  withStrategy(strategy: ICompressionStrategy): this {
    this.strategies.push(strategy);
    return this;
  }

  withStrategies(strategies: ICompressionStrategy[]): this {
    this.strategies.push(...strategies);
    return this;
  }

  withOptions(options: CompressionEngineOptions): this {
    this.options = { ...this.options, ...options };
    return this;
  }

  build(): ICompressionEngine {
    const engine = new CompressionEngine(this.tokenCounter, this.options);
    for (const strategy of this.strategies) {
      engine.registerStrategy(strategy);
    }
    return engine;
  }
}