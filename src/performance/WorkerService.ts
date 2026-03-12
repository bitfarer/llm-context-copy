import * as vscode from 'vscode';

export interface WorkerTask<T, R> {
  id: string;
  type: string;
  data: T;
  priority: number;
  processor: (data: T) => Promise<R>;
  resolve: (result: R) => void;
  reject: (error: Error) => void;
}

export class WorkerService {
  private queue: WorkerTask<any, any>[] = [];
  private processing = false;
  private maxConcurrent = 3;
  private activeCount = 0;

  constructor() {
    this.startProcessing();
  }

  async countTokens(text: string): Promise<number> {
    return this.queueTask<string, number>('tokenize', text, async () => {
      await this.simulateWork(1);
      return Math.ceil(Buffer.byteLength(text, 'utf-8') / 4);
    });
  }

  async compressContent(
    content: string,
    strategies: string[]
  ): Promise<{ compressed: string; savings: number }> {
    return this.queueTask<{ content: string; strategies: string[] }, { compressed: string; savings: number }>(
      'compress',
      { content, strategies },
      async ({ content, strategies }) => {
        await this.simulateWork(5);
        
        let compressed = content;
        
        for (const strategy of strategies) {
          if (strategy === 'removeEmptyLines') {
            compressed = compressed.replace(/^\s*$/gm, '');
          } else if (strategy === 'removeComments') {
            compressed = compressed
              .replace(/\/\*[\s\S]*?\*\//g, '')
              .replace(/\/\/.*$/gm, '');
          } else if (strategy === 'minifyWhitespace') {
            compressed = compressed
              .replace(/[ \t]+/g, ' ')
              .replace(/\n+/g, '\n');
          }
        }
        
        const savings = content.length > 0 
          ? ((content.length - compressed.length) / content.length) * 100 
          : 0;
        
        return { compressed, savings };
      }
    );
  }

  async analyzeDependencies(files: string[]): Promise<Map<string, string[]>> {
    return this.queueTask<string[], Map<string, string[]>>(
      'analyze',
      files,
      async (fileList) => {
        await this.simulateWork(fileList.length);
        
        const dependencies = new Map<string, string[]>();
        
        for (const file of fileList) {
          try {
            const content = await this.readFile(file);
            const imports = this.extractImports(content);
            dependencies.set(file, imports);
          } catch {
            dependencies.set(file, []);
          }
        }
        
        return dependencies;
      }
    );
  }

  async batchCountTokens(
    texts: string[],
    onProgress?: (current: number, total: number) => void
  ): Promise<number[]> {
    const results: number[] = [];
    const total = texts.length;
    
    for (let i = 0; i < texts.length; i += this.maxConcurrent) {
      const batch = texts.slice(i, i + this.maxConcurrent);
      
      const batchResults = await Promise.all(
        batch.map(text => this.countTokens(text))
      );
      
      results.push(...batchResults);
      
      if (onProgress) {
        onProgress(Math.min(i + this.maxConcurrent, total), total);
      }
    }
    
    return results;
  }

  private async queueTask<T, R>(
    type: string,
    data: T,
    processor: (data: T) => Promise<R>
  ): Promise<R> {
    return new Promise((resolve, reject) => {
      const task: WorkerTask<T, R> = {
        id: this.generateId(),
        type,
        data,
        priority: this.getPriority(type),
        processor,
        resolve,
        reject,
      };
      
      this.queue.push(task);
      this.queue.sort((a, b) => a.priority - b.priority);
    });
  }

  private async startProcessing(): Promise<void> {
    while (true) {
      await this.processNext();
      await this.simulateWork(1);
    }
  }

  private async processNext(): Promise<void> {
    if (this.activeCount >= this.maxConcurrent || this.queue.length === 0) {
      return;
    }

    const task = this.queue.shift();
    if (!task) { return; }

    this.activeCount++;

    try {
      const result = await task.processor(task.data);
      task.resolve(result);
    } catch (error) {
      task.reject(error instanceof Error ? error : new Error(String(error)));
    } finally {
      this.activeCount--;
    }
  }

  private getPriority(type: string): number {
    const priorities: Record<string, number> = {
      tokenize: 1,
      compress: 2,
      analyze: 3,
      batch: 4,
    };
    return priorities[type] ?? 5;
  }

  private extractImports(content: string): string[] {
    const imports: string[] = [];
    
    const patterns = [
      /import\s+.*?from\s+['"]([^'"]+)['"]/g,
      /import\s*\(['"]([^'"]+)['"]\)/g,
      /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        imports.push(match[1]);
      }
    }

    return imports;
  }

  private async readFile(filePath: string): Promise<string> {
    const uri = vscode.Uri.file(filePath);
    const doc = await vscode.workspace.openTextDocument(uri);
    return doc.getText();
  }

  private async simulateWork(ms: number): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, ms));
  }

  private generateId(): string {
    return Math.random().toString(36).substring(2, 15);
  }

  getQueueLength(): number {
    return this.queue.length;
  }

  getActiveCount(): number {
    return this.activeCount;
  }

  dispose(): void {
    this.queue = [];
    this.processing = false;
  }
}


