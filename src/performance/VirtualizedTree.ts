import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';

export interface TreeNode {
  id: string;
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: string[];
  depth: number;
  size?: number;
  tokenCount?: number;
  isLoaded: boolean;
}

export interface ChunkResult {
  nodes: TreeNode[];
  hasMore: boolean;
  nextOffset: number;
}

export interface LazyLoadOptions {
  chunkSize: number;
  maxDepth: number;
  batchDelay: number;
}

export class VirtualizedTreeProvider {
  private rootPath: string;
  private treeCache: Map<string, TreeNode> = new Map();
  private directoryContents: Map<string, string[]> = new Map();
  private loadedPaths: Set<string> = new Set();
  private options: LazyLoadOptions;
  private fileWatcher: any = null;
  private refreshCallbacks: Array<(changedPath: string) => void> = [];

  constructor(rootPath: string, options?: Partial<LazyLoadOptions>) {
    this.rootPath = rootPath;
    this.options = {
      chunkSize: options?.chunkSize ?? 50,
      maxDepth: options?.maxDepth ?? 10,
      batchDelay: options?.batchDelay ?? 10,
    };
  }

  async loadRoot(): Promise<TreeNode> {
    const rootNode: TreeNode = {
      id: this.rootPath,
      name: path.basename(this.rootPath),
      path: this.rootPath,
      type: 'directory',
      children: [],
      depth: 0,
      isLoaded: false,
    };

    this.treeCache.set(this.rootPath, rootNode);
    await this.preloadDirectory(this.rootPath, 0);

    return rootNode;
  }

  async preloadDirectory(dirPath: string, depth: number): Promise<void> {
    if (depth > this.options.maxDepth) { return; }
    if (this.loadedPaths.has(dirPath)) { return; }

    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      const children = entries
        .filter(e => !this.shouldExclude(e.name))
        .map(e => {
          const fullPath = path.join(dirPath, e.name);
          const node: TreeNode = {
            id: fullPath,
            name: e.name,
            path: fullPath,
            type: e.isDirectory() ? 'directory' : 'file',
            depth: depth + 1,
            children: e.isDirectory() ? [] : undefined,
            isLoaded: false,
          };
          
          this.treeCache.set(fullPath, node);
          return e.name;
        })
        .sort((a, b) => {
          const nodeA = this.treeCache.get(path.join(dirPath, a));
          const nodeB = this.treeCache.get(path.join(dirPath, b));
          if (nodeA?.type !== nodeB?.type) {
            return nodeA?.type === 'directory' ? -1 : 1;
          }
          return a.localeCompare(b);
        });

      this.directoryContents.set(dirPath, children);
      this.loadedPaths.add(dirPath);

      const parent = this.treeCache.get(dirPath);
      if (parent) {
        parent.children = children;
        parent.isLoaded = true;
      }
    } catch {
      // Ignore permission errors
    }
  }

  async loadChildren(parentPath: string): Promise<ChunkResult> {
    const parent = this.treeCache.get(parentPath);
    if (!parent || parent.type !== 'directory') {
      return { nodes: [], hasMore: false, nextOffset: 0 };
    }

    if (!this.directoryContents.has(parentPath)) {
      await this.preloadDirectory(parentPath, parent.depth);
    }

    const allChildren = this.directoryContents.get(parentPath) || [];
    const nodes: TreeNode[] = [];

    for (const childName of allChildren) {
      const childPath = path.join(parentPath, childName);
      const node = this.treeCache.get(childPath);
      if (node) {
        nodes.push(node);
      }
    }

    return {
      nodes,
      hasMore: false,
      nextOffset: nodes.length,
    };
  }

  async loadChunk(parentPath: string, offset: number, limit: number): Promise<ChunkResult> {
    const parent = this.treeCache.get(parentPath);
    if (!parent || parent.type !== 'directory') {
      return { nodes: [], hasMore: false, nextOffset: offset };
    }

    if (!this.directoryContents.has(parentPath)) {
      await this.preloadDirectory(parentPath, parent.depth);
    }

    const allChildren = this.directoryContents.get(parentPath) || [];
    const slice = allChildren.slice(offset, offset + limit);
    const nodes: TreeNode[] = [];

    for (const childName of slice) {
      const childPath = path.join(parentPath, childName);
      const node = this.treeCache.get(childPath);
      if (node) {
        nodes.push(node);
      }
    }

    return {
      nodes,
      hasMore: offset + limit < allChildren.length,
      nextOffset: offset + limit,
    };
  }

  async loadNodeDetails(nodePath: string): Promise<TreeNode | null> {
    let node = this.treeCache.get(nodePath);
    
    if (!node) {
      try {
        const stat = await fs.stat(nodePath);
        node = {
          id: nodePath,
          name: path.basename(nodePath),
          path: nodePath,
          type: stat.isDirectory() ? 'directory' : 'file',
          depth: 0,
          size: stat.size,
          isLoaded: true,
        };
        this.treeCache.set(nodePath, node);
      } catch {
        return null;
      }
    }

    if (node.type === 'file' && node.size === undefined) {
      try {
        const stat = await fs.stat(nodePath);
        node.size = stat.size;
      } catch {
        // Ignore
      }
    }

    if (node.type === 'directory' && !node.isLoaded) {
      await this.preloadDirectory(nodePath, node.depth);
    }

    return node;
  }

  getNode(nodePath: string): TreeNode | undefined {
    return this.treeCache.get(nodePath);
  }

  async searchFiles(query: string, maxResults: number = 50): Promise<TreeNode[]> {
    const results: TreeNode[] = [];
    const normalizedQuery = query.toLowerCase();
    
    const searchDirs = [this.rootPath];
    
    while (searchDirs.length > 0 && results.length < maxResults) {
      const currentDir = searchDirs.shift()!;
      
      try {
        const entries = await fs.readdir(currentDir, { withFileTypes: true });
        
        for (const entry of entries) {
          if (results.length >= maxResults) break;
          
          const fullPath = path.join(currentDir, entry.name);
          
          if (this.shouldExclude(entry.name)) continue;
          
          if (entry.name.toLowerCase().includes(normalizedQuery)) {
            const node = this.treeCache.get(fullPath);
            if (node) {
              results.push(node);
            }
          }
          
          if (entry.isDirectory()) {
            searchDirs.push(fullPath);
          }
        }
      } catch {
        // Ignore permission errors
      }
    }

    return results;
  }

  private shouldExclude(name: string): boolean {
    const excludePatterns = [
      'node_modules',
      '.git',
      'dist',
      'build',
      '.vscode',
      '.idea',
    ];
    return excludePatterns.includes(name);
  }

  async invalidateNode(nodePath: string): Promise<void> {
    this.loadedPaths.delete(nodePath);
    this.directoryContents.delete(nodePath);
    
    const node = this.treeCache.get(nodePath);
    if (node) {
      node.isLoaded = false;
    }

    for (const callback of this.refreshCallbacks) {
      callback(nodePath);
    }
  }

  async invalidateTree(): Promise<void> {
    this.loadedPaths.clear();
    this.directoryContents.clear();
    this.treeCache.clear();
    
    for (const callback of this.refreshCallbacks) {
      callback(this.rootPath);
    }
  }

  onRefresh(callback: (changedPath: string) => void): void {
    this.refreshCallbacks.push(callback);
  }

  dispose(): void {
    if (this.fileWatcher) {
      this.fileWatcher.close();
      this.fileWatcher = null;
    }
    this.refreshCallbacks = [];
    this.treeCache.clear();
    this.directoryContents.clear();
    this.loadedPaths.clear();
  }
}

export class ChunkedTokenCounter {
  private options: { chunkSize: number; delay: number };

  constructor(options?: { chunkSize?: number; delay?: number }) {
    this.options = {
      chunkSize: options?.chunkSize ?? 100,
      delay: options?.delay ?? 5,
    };
  }

  async countTokensInFiles(
    filePaths: string[],
    onProgress?: (current: number, total: number) => void
  ): Promise<Map<string, number>> {
    const results = new Map<string, number>();
    const total = filePaths.length;
    let processed = 0;

    for (let i = 0; i < filePaths.length; i += this.options.chunkSize) {
      const chunk = filePaths.slice(i, i + this.options.chunkSize);
      
      const promises = chunk.map(async (filePath) => {
        try {
          const content = await fs.readFile(filePath, 'utf-8');
          const tokens = this.estimateTokens(content);
          results.set(filePath, tokens);
        } catch {
          results.set(filePath, 0);
        }
      });

      await Promise.all(promises);
      processed += chunk.length;
      
      if (onProgress) {
        onProgress(processed, total);
      }

      if (i + this.options.chunkSize < filePaths.length) {
        await new Promise(resolve => setTimeout(resolve, this.options.delay));
      }
    }

    return results;
  }

  private estimateTokens(text: string): number {
    return Math.ceil(Buffer.byteLength(text, 'utf-8') / 4);
  }
}
