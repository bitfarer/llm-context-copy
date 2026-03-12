import * as vscode from 'vscode';

export interface TokenCountResult {
  tokens: number;
  charCount: number;
  wordCount: number;
  lineCount: number;
}

export interface ModelInfo {
  name: string;
  tokenizer: string;
  avgTokensPerChar: number;
}

export class TrueTokenizer {
  private cache: Map<string, number> = new Map();
  private model: string;
  private tokensPerChar: number;

  private static readonly MODEL_INFO: Record<string, ModelInfo> = {
    'gpt-4': { name: 'GPT-4', tokenizer: 'cl100k_base', avgTokensPerChar: 0.25 },
    'gpt-4-32k': { name: 'GPT-4 32K', tokenizer: 'cl100k_base', avgTokensPerChar: 0.25 },
    'gpt-3.5-turbo': { name: 'GPT-3.5 Turbo', tokenizer: 'cl100k_base', avgTokensPerChar: 0.25 },
    'gpt-35-turbo': { name: 'GPT-3.5 Turbo', tokenizer: 'cl100k_base', avgTokensPerChar: 0.25 },
    'claude-3-opus': { name: 'Claude 3 Opus', tokenizer: 'cl100k_base', avgTokensPerChar: 0.25 },
    'claude-3-sonnet': { name: 'Claude 3 Sonnet', tokenizer: 'cl100k_base', avgTokensPerChar: 0.25 },
    'claude-3-haiku': { name: 'Claude 3 Haiku', tokenizer: 'cl100k_base', avgTokensPerChar: 0.25 },
    'claude-2': { name: 'Claude 2', tokenizer: 'cl100k_base', avgTokensPerChar: 0.25 },
    'claude-instant': { name: 'Claude Instant', tokenizer: 'cl100k_base', avgTokensPerChar: 0.25 },
    'llama-2': { name: 'Llama 2', tokenizer: 'llama2', avgTokensPerChar: 0.28 },
    'codellama': { name: 'CodeLlama', tokenizer: 'llama2', avgTokensPerChar: 0.28 },
    'mistral': { name: 'Mistral', tokenizer: 'mistral', avgTokensPerChar: 0.27 },
    'default': { name: 'Default', tokenizer: 'cl100k_base', avgTokensPerChar: 0.25 },
  };

  constructor(model: string = 'default') {
    this.model = model.toLowerCase();
    const info = TrueTokenizer.MODEL_INFO[this.model] || TrueTokenizer.MODEL_INFO['default'];
    this.tokensPerChar = info.avgTokensPerChar;
  }

  async countTokens(text: string): Promise<number> {
    if (!text) return 0;

    const cached = this.cache.get(text);
    if (cached !== undefined) return cached;

    const tokens = await this.calculateTokens(text);
    
    if (this.cache.size > 1000) {
      this.cache.clear();
    }
    this.cache.set(text, tokens);

    return tokens;
  }

  private async calculateTokens(text: string): Promise<number> {
    try {
      const tokens = await this.countWithTiktoken(text);
      return tokens;
    } catch {
      return this.estimateTokens(text);
    }
  }

  private async countWithTiktoken(text: string): Promise<number> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const tiktoken = require('tiktoken') as any;
      const encoder = tiktoken.get_encoding('cl100k_base');
      const tokens = encoder.encode(text);
      encoder.free();
      return tokens.length;
    } catch {
      // Fallback to estimation
      throw new Error('tiktoken not available, using estimation');
    }
  }

  private estimateTokens(text: string): number {
    const byteLength = Buffer.byteLength(text, 'utf-8');
    return Math.ceil(byteLength * this.tokensPerChar);
  }

  async countFileTokens(filePath: string): Promise<TokenCountResult> {
    try {
      const uri = vscode.Uri.file(filePath);
      const doc = await vscode.workspace.openTextDocument(uri);
      const text = doc.getText();
      
      const tokens = await this.countTokens(text);
      const charCount = text.length;
      const wordCount = text.split(/\s+/).filter(w => w.length > 0).length;
      const lineCount = text.split('\n').length;

      return { tokens, charCount, wordCount, lineCount };
    } catch {
      return { tokens: 0, charCount: 0, wordCount: 0, lineCount: 0 };
    }
  }

  async countProjectTokens(files: { content: string }[]): Promise<TokenCountResult> {
    let totalTokens = 0;
    let totalChars = 0;
    let totalWords = 0;
    let totalLines = 0;

    for (const file of files) {
      const tokens = await this.countTokens(file.content);
      totalTokens += tokens;
      totalChars += file.content.length;
      totalWords += file.content.split(/\s+/).filter(w => w.length > 0).length;
      totalLines += file.content.split('\n').length;
    }

    return {
      tokens: totalTokens,
      charCount: totalChars,
      wordCount: totalWords,
      lineCount: totalLines,
    };
  }

  setModel(model: string): void {
    this.model = model.toLowerCase();
    const info = TrueTokenizer.MODEL_INFO[this.model] || TrueTokenizer.MODEL_INFO['default'];
    this.tokensPerChar = info.avgTokensPerChar;
    this.cache.clear();
  }

  getModelInfo(): ModelInfo {
    return TrueTokenizer.MODEL_INFO[this.model] || TrueTokenizer.MODEL_INFO['default'];
  }

  static getSupportedModels(): ModelInfo[] {
    return Object.values(TrueTokenizer.MODEL_INFO);
  }

  static getModelFromPrompt(prompt: string): string {
    const lowerPrompt = prompt.toLowerCase();
    
    if (lowerPrompt.includes('gpt-4-32k')) return 'gpt-4-32k';
    if (lowerPrompt.includes('gpt-4')) return 'gpt-4';
    if (lowerPrompt.includes('gpt-3.5') || lowerPrompt.includes('gpt-35')) return 'gpt-3.5-turbo';
    if (lowerPrompt.includes('claude-3-opus')) return 'claude-3-opus';
    if (lowerPrompt.includes('claude-3-sonnet')) return 'claude-3-sonnet';
    if (lowerPrompt.includes('claude-3-haiku')) return 'claude-3-haiku';
    if (lowerPrompt.includes('claude-2')) return 'claude-2';
    if (lowerPrompt.includes('claude')) return 'claude-instant';
    if (lowerPrompt.includes('llama-2') || lowerPrompt.includes('llama2')) return 'llama-2';
    if (lowerPrompt.includes('codellama') || lowerPrompt.includes('code llama')) return 'codellama';
    if (lowerPrompt.includes('mistral')) return 'mistral';
    
    return 'default';
  }

  clearCache(): void {
    this.cache.clear();
  }

  getCacheSize(): number {
    return this.cache.size;
  }
}

export class TokenBudgetEstimator {
  private tokenizer: TrueTokenizer;

  constructor(model: string = 'default') {
    this.tokenizer = new TrueTokenizer(model);
  }

  async estimateCompletionTokens(prompt: string, maxResponse: number = 4096): Promise<{
    promptTokens: number;
    maxResponseTokens: number;
    remainingBudget: number;
  }> {
    const promptTokens = await this.tokenizer.countTokens(prompt);
    
    return {
      promptTokens,
      maxResponseTokens: maxResponse,
      remainingBudget: Math.max(0, 128000 - promptTokens - maxResponse),
    };
  }

  async suggestMaxTokens(
    prompt: string,
    modelLimit: number = 128000
  ): Promise<number> {
    const promptTokens = await this.tokenizer.countTokens(prompt);
    const suggested = modelLimit - promptTokens;
    
    return Math.max(0, Math.min(suggested, 32000));
  }

  async canFit(
    items: { content: string }[],
    maxTokens: number
  ): Promise<{ canFit: boolean; totalTokens: number; overshoot: number }> {
    const result = await this.tokenizer.countProjectTokens(items);
    
    return {
      canFit: result.tokens <= maxTokens,
      totalTokens: result.tokens,
      overshoot: Math.max(0, result.tokens - maxTokens),
    };
  }

  async findOptimalSubset(
    items: { content: string; priority: number }[],
    maxTokens: number
  ): Promise<{ selected: { content: string; priority: number }[]; totalTokens: number }> {
    const sorted = [...items].sort((a, b) => b.priority - a.priority);
    
    const selected: { content: string; priority: number }[] = [];
    let totalTokens = 0;

    for (const item of sorted) {
      const itemTokens = await this.tokenizer.countTokens(item.content);
      
      if (totalTokens + itemTokens <= maxTokens) {
        selected.push(item);
        totalTokens += itemTokens;
      }
    }

    return { selected, totalTokens };
  }
}
