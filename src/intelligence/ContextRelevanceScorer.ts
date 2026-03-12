import * as vscode from 'vscode';
import * as path from 'path';
import { FileContext } from '../types';
import { DependencyGraphAnalyzer } from './DependencyGraph';

export interface RelevanceScore {
  file: FileContext;
  score: number;
  factors: ScoreFactor[];
}

export interface ScoreFactor {
  name: string;
  weight: number;
  reason: string;
}

export interface ScorerOptions {
  weights: {
    activeEditor: number;
    recentFiles: number;
    dependencies: number;
    fileType: number;
    pathSimilarity: number;
    imports: number;
  };
}

const DEFAULT_WEIGHTS: ScorerOptions['weights'] = {
  activeEditor: 30,
  recentFiles: 20,
  dependencies: 25,
  fileType: 15,
  pathSimilarity: 10,
  imports: 15,
};

export class ContextRelevanceScorer {
  private options: ScorerOptions;
  private recentFiles: Map<string, number> = new Map();
  private activeEditorFile: string | undefined;
  private dependencyGraph?: DependencyGraphAnalyzer;
  private workspaceRoot: string = '';

  constructor(options?: Partial<ScorerOptions>) {
    this.options = {
      weights: { ...DEFAULT_WEIGHTS, ...options?.weights },
    };

    this.setupListeners();
  }

  private setupListeners(): void {
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor) {
        this.activeEditorFile = editor.document.uri.fsPath;
        this.addRecentFile(editor.document.uri.fsPath);
      }
    });

    vscode.workspace.onDidOpenTextDocument((doc) => {
      this.addRecentFile(doc.uri.fsPath);
    });
  }

  private addRecentFile(filePath: string): void {
    this.recentFiles.set(filePath, Date.now());

    if (this.recentFiles.size > 50) {
      const entries = [...this.recentFiles.entries()];
      entries.sort((a, b) => b[1] - a[1]);
      this.recentFiles = new Map(entries.slice(0, 50));
    }
  }

  setDependencyGraph(graph: DependencyGraphAnalyzer, workspaceRoot: string): void {
    this.dependencyGraph = graph;
    this.workspaceRoot = workspaceRoot;
  }

  async scoreFiles(
    files: FileContext[],
    workspaceRoot: string
  ): Promise<RelevanceScore[]> {
    this.workspaceRoot = workspaceRoot;
    const scores: RelevanceScore[] = [];

    for (const file of files) {
      const factors: ScoreFactor[] = [];
      let totalScore = 0;

      const activeEditorScore = this.calculateActiveEditorScore(file, factors);
      const recentScore = this.calculateRecentScore(file, factors);
      const fileTypeScore = this.calculateFileTypeScore(file, factors);
      const pathSimilarityScore = await this.calculatePathSimilarityScore(file, workspaceRoot, factors);
      const importsScore = await this.calculateImportsScore(file, workspaceRoot, factors);
      const dependenciesScore = this.calculateDependenciesScore(file, factors);

      totalScore = activeEditorScore + recentScore + fileTypeScore + pathSimilarityScore + importsScore + dependenciesScore;

      scores.push({
        file,
        score: totalScore,
        factors,
      });
    }

    scores.sort((a, b) => b.score - a.score);

    return scores;
  }

  private calculateDependenciesScore(file: FileContext, factors: ScoreFactor[]): number {
    if (!this.dependencyGraph || !this.activeEditorFile || !this.workspaceRoot) {
      return 0;
    }

    const activeRelative = path.relative(this.workspaceRoot, this.activeEditorFile).replace(/\\/g, '/');
    const fileRelative = file.relativePath;

    const graph = this.dependencyGraph.getGraph();
    const directImports = graph.edges.get(activeRelative);

    // Check if file is directly imported by active file
    if (directImports?.has(fileRelative)) {
      factors.push({
        name: 'dependencies',
        weight: this.options.weights.dependencies,
        reason: 'Direct dependency: imported by active file',
      });
      return this.options.weights.dependencies;
    }

    // Check if file imports the active file (dependent)
    const fileImports = graph.edges.get(fileRelative);
    if (fileImports?.has(activeRelative)) {
      factors.push({
        name: 'dependencies',
        weight: this.options.weights.dependencies * 0.8,
        reason: 'Dependent: file imports active file',
      });
      return this.options.weights.dependencies * 0.8;
    }

    // Check for shared dependencies (both import the same file)
    if (directImports) {
      for (const sharedDep of directImports) {
        const sharedDepImports = graph.edges.get(sharedDep);
        if (sharedDepImports?.has(fileRelative)) {
          factors.push({
            name: 'dependencies',
            weight: this.options.weights.dependencies * 0.5,
            reason: 'Shared dependency: both import common file',
          });
          return this.options.weights.dependencies * 0.5;
        }
      }
    }

    return 0;
  }

  private calculateActiveEditorScore(file: FileContext, factors: ScoreFactor[]): number {
    if (!this.activeEditorFile) {
      return 0;
    }

    const activePath = this.activeEditorFile.replace(/\\/g, '/');
    const filePath = file.path.replace(/\\/g, '/');

    if (activePath === filePath) {
      factors.push({
        name: 'activeEditor',
        weight: this.options.weights.activeEditor,
        reason: 'Currently open in editor',
      });
      return this.options.weights.activeEditor;
    }

    const activeDir = activePath.substring(0, activePath.lastIndexOf('/'));
    const fileDir = filePath.substring(0, filePath.lastIndexOf('/'));

    if (activeDir === fileDir || filePath.includes(activeDir) || activeDir.includes(fileDir)) {
      const partialScore = this.options.weights.activeEditor * 0.5;
      factors.push({
        name: 'activeEditor',
        weight: partialScore,
        reason: 'In same directory as active editor',
      });
      return partialScore;
    }

    return 0;
  }

  private calculateRecentScore(file: FileContext, factors: ScoreFactor[]): number {
    const filePath = file.path.replace(/\\/g, '/');
    const lastOpened = this.recentFiles.get(filePath);

    if (!lastOpened) {
      return 0;
    }

    const timeDiff = Date.now() - lastOpened;
    const maxTimeDiff = 3600000;

    const recencyScore = Math.max(0, 1 - timeDiff / maxTimeDiff) * this.options.weights.recentFiles;

    if (recencyScore > 0) {
      factors.push({
        name: 'recentFiles',
        weight: recencyScore,
        reason: 'Recently opened',
      });
    }

    return recencyScore;
  }

  private calculateFileTypeScore(file: FileContext, factors: ScoreFactor[]): number {
    const ext = file.relativePath.toLowerCase().split('.').pop();
    
    const priorityExtensions: Record<string, number> = {
      'ts': 1.0,
      'tsx': 1.0,
      'js': 0.9,
      'jsx': 0.9,
      'py': 0.85,
      'go': 0.85,
      'rs': 0.85,
      'java': 0.8,
      'json': 0.6,
      'yaml': 0.6,
      'yml': 0.6,
      'md': 0.4,
    };

    const priority = priorityExtensions[ext || ''] ?? 0.3;
    const score = priority * this.options.weights.fileType;

    factors.push({
      name: 'fileType',
      weight: score,
      reason: `Priority file type (.${ext})`,
    });

    return score;
  }

  private async calculatePathSimilarityScore(
    file: FileContext,
    workspaceRoot: string,
    factors: ScoreFactor[]
  ): Promise<number> {
    if (!this.activeEditorFile) {
      return 0;
    }

    const activePath = this.activeEditorFile.replace(/\\/g, '/');
    const filePath = file.path.replace(/\\/g, '/');
    const root = workspaceRoot.replace(/\\/g, '/');

    const activeRelative = activePath.replace(root, '').split('/').filter(Boolean);
    const fileRelative = filePath.replace(root, '').split('/').filter(Boolean);

    // 1. Calculate common prefix (directory hierarchy)
    let commonPrefixParts = 0;
    const minLen = Math.min(activeRelative.length, fileRelative.length);

    for (let i = 0; i < minLen; i++) {
      if (activeRelative[i] === fileRelative[i]) {
        commonPrefixParts++;
      } else {
        break;
      }
    }

    // 2. Calculate directory overlap (files in same parent directories)
    const activeDirs = new Set(activeRelative.slice(0, -1));
    const fileDirs = new Set(fileRelative.slice(0, -1));
    const commonDirs = [...activeDirs].filter(d => fileDirs.has(d));
    const dirOverlapScore = commonDirs.length / Math.max(activeDirs.size, fileDirs.size, 1);

    // 3. Calculate filename similarity
    const activeName = activeRelative[activeRelative.length - 1] || '';
    const fileName = fileRelative[fileRelative.length - 1] || '';
    const nameSimilarity = this.calculateStringSimilarity(activeName, fileName);

    // 4. Check for sibling relationship (same parent directory)
    const isSibling = activeRelative.length === fileRelative.length &&
                      commonPrefixParts === activeRelative.length - 1;
    const siblingBonus = isSibling ? 0.2 : 0;

    // 5. Weighted combination
    const prefixScore = minLen > 0 ? commonPrefixParts / minLen : 0;
    const finalSimilarity = (prefixScore * 0.4) + (dirOverlapScore * 0.3) + (nameSimilarity * 0.2) + siblingBonus;
    const score = finalSimilarity * this.options.weights.pathSimilarity;

    if (score > 0) {
      const reasons: string[] = [];
      if (commonPrefixParts > 0) reasons.push(`${commonPrefixParts} common path segments`);
      if (commonDirs.length > 0) reasons.push(`${commonDirs.length} shared directories`);
      if (nameSimilarity > 0.5) reasons.push('similar filenames');
      if (isSibling) reasons.push('sibling files');

      factors.push({
        name: 'pathSimilarity',
        weight: score,
        reason: reasons.join(', ') || 'path similarity',
      });
    }

    return score;
  }

  private calculateStringSimilarity(str1: string, str2: string): number {
    if (str1 === str2) return 1;
    if (!str1 || !str2) return 0;

    // Remove file extensions for comparison
    const name1 = str1.replace(/\.[^.]+$/, '');
    const name2 = str2.replace(/\.[^.]+$/, '');

    // Check for common naming patterns
    const parts1 = name1.split(/[-_.]/).filter(p => p.length > 0);
    const parts2 = name2.split(/[-_.]/).filter(p => p.length > 0);

    const commonParts = parts1.filter(p =>
      parts2.some(p2 => p2.toLowerCase() === p.toLowerCase())
    );

    return commonParts.length / Math.max(parts1.length, parts2.length, 1);
  }

  private async calculateImportsScore(
    file: FileContext,
    workspaceRoot: string,
    factors: ScoreFactor[]
  ): Promise<number> {
    if (!this.activeEditorFile) {
      return 0;
    }

    const activePath = this.activeEditorFile.replace(/\\/g, '/');
    const activeFileName = path.basename(activePath, path.extname(activePath));
    const activeDir = path.dirname(activePath);

    const content = file.content;
    const imports = this.extractImports(content);

    let score = 0;
    const reasons: string[] = [];

    for (const imp of imports) {
      // Skip node_modules imports
      if (!imp.startsWith('.')) {
        continue;
      }

      // Resolve relative import path
      const fileDir = path.dirname(file.path);
      const resolvedImport = path.resolve(fileDir, imp);
      const normalizedImport = resolvedImport.replace(/\\/g, '/');

      // Check if import resolves to active file
      if (normalizedImport === activePath) {
        score = this.options.weights.imports;
        reasons.push(`Directly imports active file`);
        break;
      }

      // Check if import resolves to same directory as active file
      const importDir = path.dirname(normalizedImport);
      if (importDir === activeDir) {
        score = Math.max(score, this.options.weights.imports * 0.7);
        reasons.push(`Imports from same directory as active file`);
      }

      // Check if import name matches active file name
      const importName = path.basename(normalizedImport, path.extname(normalizedImport));
      if (importName.toLowerCase() === activeFileName.toLowerCase()) {
        score = Math.max(score, this.options.weights.imports * 0.5);
        reasons.push(`Imports file with similar name`);
      }
    }

    // Also check if active file imports this file (reverse relationship)
    if (this.dependencyGraph && score === 0) {
      const fileRelative = path.relative(workspaceRoot, file.path).replace(/\\/g, '/');
      const activeRelative = path.relative(workspaceRoot, this.activeEditorFile).replace(/\\/g, '/');
      const graph = this.dependencyGraph.getGraph();
      const activeImports = graph.edges.get(activeRelative);

      if (activeImports?.has(fileRelative)) {
        score = this.options.weights.imports * 0.8;
        reasons.push(`Active file imports this file`);
      }
    }

    if (score > 0) {
      factors.push({
        name: 'imports',
        weight: Math.min(score, this.options.weights.imports),
        reason: reasons.join('; ') || 'Import relationship detected',
      });
    }

    return Math.min(score, this.options.weights.imports);
  }

  private extractImports(content: string): string[] {
    const imports: string[] = [];

    const importPatterns = [
      /import\s+.*?from\s+['"]([^'"]+)['"]/g,
      /import\s*\(['"]([^'"]+)['"]\)/g,
      /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
      /export\s+.*?from\s+['"]([^'"]+)['"]/g,
    ];

    for (const pattern of importPatterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        imports.push(match[1]);
      }
    }

    return [...new Set(imports)]; // Remove duplicates
  }

  suggestFiles(
    scoredFiles: RelevanceScore[],
    maxFiles: number = 10
  ): FileContext[] {
    const totalScore = scoredFiles.reduce((sum, f) => sum + f.score, 0);
    
    const topFiles = scoredFiles.slice(0, maxFiles * 2);
    
    const selected: FileContext[] = [];
    let currentTokens = 0;
    const maxTokens = 64000;

    for (const scored of topFiles) {
      if (selected.length >= maxFiles) break;
      
      const fileTokens = Math.ceil(scored.file.content.length / 4);
      if (currentTokens + fileTokens > maxTokens) continue;

      selected.push(scored.file);
      currentTokens += fileTokens;
    }

    return selected;
  }

  updateWeights(weights: Partial<ScorerOptions['weights']>): void {
    this.options.weights = { ...this.options.weights, ...weights };
  }
}

export function createRelevanceScorer(options?: Partial<ScorerOptions>): ContextRelevanceScorer {
  return new ContextRelevanceScorer(options);
}
