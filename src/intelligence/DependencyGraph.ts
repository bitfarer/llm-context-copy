import * as fs from 'fs/promises';
import * as path from 'path';

export interface DependencyNode {
  path: string;
  relativePath: string;
  imports: string[];
  exports: string[];
  type: 'file' | 'directory';
}

export interface DependencyGraph {
  nodes: Map<string, DependencyNode>;
  edges: Map<string, Set<string>>;
}

export interface ImportPattern {
  pattern: RegExp;
  type: 'es6' | 'commonjs' | 'dynamic' | 'relative';
}

const IMPORT_PATTERNS: ImportPattern[] = [
  { pattern: /import\s+.*?from\s+['"]([^'"]+)['"]/g, type: 'es6' },
  { pattern: /import\s*\(['"]([^'"]+)['"]\)/g, type: 'dynamic' },
  { pattern: /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g, type: 'commonjs' },
  { pattern: /^import\s+['"]([^'"]+)['"]/gm, type: 'es6' },
  { pattern: /export\s+.*?from\s+['"]([^'"]+)['"]/g, type: 'es6' },
  { pattern: /export\s*\{[^}]*\}\s*from\s*['"]([^'"]+)['"]/g, type: 'es6' },
  { pattern: /from\s+['"]([^'"]+)['"]/g, type: 'relative' },
];

export class DependencyGraphAnalyzer {
  private graph: DependencyGraph = {
    nodes: new Map(),
    edges: new Map(),
  };
  private workspaceRoot: string = '';
  private fileExtensions: string[] = ['.ts', '.tsx', '.js', '.jsx', '.py', '.java', '.go', '.rs'];
  private extensionCache: Map<string, string | null> = new Map();

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
  }

  clearCache(): void {
    this.extensionCache.clear();
  }

  private async resolveImportWithCache(importPath: string, fromDir: string): Promise<string | null> {
    if (importPath.startsWith('.')) {
      const resolved = path.resolve(fromDir, importPath);
      const cacheKey = resolved;

      const cached = this.extensionCache.get(cacheKey);
      if (cached !== undefined) {
        return cached;
      }

      let result: string | null = null;
      for (const ext of this.fileExtensions) {
        const fullPath = resolved + ext;
        try {
          await fs.access(fullPath);
          result = path.relative(this.workspaceRoot, fullPath).replace(/\\/g, '/');
          break;
        } catch {
          continue;
        }
      }

      if (!result) {
        try {
          await fs.access(resolved);
          result = path.relative(this.workspaceRoot, resolved).replace(/\\/g, '/');
        } catch {
          result = null;
        }
      }

      this.extensionCache.set(cacheKey, result);
      return result;
    }

    return importPath;
  }

  async analyzeFile(filePath: string): Promise<DependencyNode | null> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const relativePath = path.relative(this.workspaceRoot, filePath).replace(/\\/g, '/');
      
      const imports = await this.extractImports(content, path.dirname(filePath));
      const exports = this.extractExports(content);

      const node: DependencyNode = {
        path: filePath,
        relativePath,
        imports,
        exports,
        type: 'file',
      };

      this.graph.nodes.set(relativePath, node);
      
      for (const imp of imports) {
        if (!this.graph.edges.has(relativePath)) {
          this.graph.edges.set(relativePath, new Set());
        }
        this.graph.edges.get(relativePath)!.add(imp);
      }

      return node;
    } catch {
      return null;
    }
  }

  private async extractImports(content: string, fileDir: string): Promise<string[]> {
    const imports: string[] = [];

    for (const { pattern, type } of IMPORT_PATTERNS) {
      pattern.lastIndex = 0;
      let match;
      
      while ((match = pattern.exec(content)) !== null) {
        const importPath = match[1];
        
        if (!importPath || importPath.startsWith('.') === false && type === 'relative') {
          continue;
        }

        const resolved = await this.resolveImport(importPath, fileDir);
        if (resolved) {
          imports.push(resolved);
        }
      }
    }

    return [...new Set(imports)];
  }

  private async resolveImport(importPath: string, fromDir: string): Promise<string | null> {
    return this.resolveImportWithCache(importPath, fromDir);
  }

  private extractExports(content: string): string[] {
    const exports: string[] = [];
    
    const exportNamed = content.match(/export\s+(?:const|let|var|function|class|interface|type|enum)\s+(\w+)/g);
    if (exportNamed) {
      exportNamed.forEach(match => {
        const name = match.replace(/export\s+(?:const|let|var|function|class|interface|type|enum)\s+/, '');
        exports.push(name);
      });
    }

    const exportDefault = content.match(/export\s+default\s+(\w+)/);
    if (exportDefault) {
      exports.push(exportDefault[1]);
    }

    return exports;
  }

  async buildGraphForFiles(filePaths: string[]): Promise<DependencyGraph> {
    for (const filePath of filePaths) {
      await this.analyzeFile(filePath);
    }
    return this.graph;
  }

  getDependents(filePath: string): string[] {
    const relativePath = path.relative(this.workspaceRoot, filePath).replace(/\\/g, '/');
    const dependents: string[] = [];

    this.graph.edges.forEach((deps, source) => {
      if (deps.has(relativePath)) {
        dependents.push(source);
      }
    });

    return dependents;
  }

  getTransitiveDependencies(filePath: string): Set<string> {
    const visited = new Set<string>();
    const queue = [filePath];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);

      const deps = this.graph.edges.get(current);
      if (deps) {
        for (const dep of deps) {
          if (!visited.has(dep)) {
            queue.push(dep);
          }
        }
      }
    }

    visited.delete(filePath);
    return visited;
  }

  suggestRelatedFiles(entryFile: string, maxDepth: number = 2): string[] {
    const related = new Set<string>();
    const relativePath = path.relative(this.workspaceRoot, entryFile).replace(/\\/g, '/');

    const directImports = this.graph.edges.get(relativePath) || new Set();
    for (const imp of directImports) {
      related.add(imp);
    }

    if (maxDepth > 1) {
      const transitiveDeps = this.getTransitiveDependencies(relativePath);
      for (const dep of transitiveDeps) {
        related.add(dep);
      }
    }

    const dependents = this.getDependents(entryFile);
    for (const dep of dependents) {
      related.add(dep);
    }

    return [...related];
  }

  getGraph(): DependencyGraph {
    return this.graph;
  }

  clear(): void {
    this.graph = {
      nodes: new Map(),
      edges: new Map(),
    };
  }
}

export function findEntryPoints(rootPath: string): string[] {
  const patterns = [
    /^index\.(ts|js|tsx|jsx)$/,
    /^main\.(ts|js|tsx|jsx)$/,
    /^app\.(ts|js|tsx|jsx)$/,
    /^entry\.(ts|js|tsx|jsx)$/,
    /^(server|client)\.(ts|js|tsx|jsx)$/,
  ];

  return patterns.map(p => p.source);
}
