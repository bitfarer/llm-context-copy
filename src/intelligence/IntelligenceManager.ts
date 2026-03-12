import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import { DependencyGraphAnalyzer } from './DependencyGraph';
import { SemanticCompressionEngine } from './SemanticCompression';
import { SmartFileSorter } from './SmartFileSorter';
import { ContextRelevanceScorer } from './ContextRelevanceScorer';
import { FileContext, ProjectContext } from '../types';
import { ITokenCounter } from '../token/TokenCounter';

export interface IntelligenceOptions {
  workspaceRoot: string;
  tokenCounter: ITokenCounter;
}

export class IntelligenceManager {
  private dependencyGraph: DependencyGraphAnalyzer;
  private semanticCompression: SemanticCompressionEngine;
  private smartSorter: SmartFileSorter;
  private relevanceScorer: ContextRelevanceScorer;

  constructor(private options: IntelligenceOptions) {
    this.dependencyGraph = new DependencyGraphAnalyzer(options.workspaceRoot);
    this.semanticCompression = new SemanticCompressionEngine();
    this.smartSorter = new SmartFileSorter(options.workspaceRoot, this.dependencyGraph);
    this.relevanceScorer = new ContextRelevanceScorer();
  }

  async analyzeDependencies(files: FileContext[]): Promise<string[]> {
    const filePaths = files.map(f => f.path);
    await this.dependencyGraph.buildGraphForFiles(filePaths);
    return filePaths;
  }

  suggestRelatedFiles(entryFile: string): string[] {
    return this.dependencyGraph.suggestRelatedFiles(entryFile);
  }

  compressWithSemantic(
    files: FileContext[],
    options?: {
      preserveTypes?: boolean;
      preserveSignatures?: boolean;
      collapseFunctionBodies?: boolean;
    }
  ): FileContext[] {
    const compressor = new SemanticCompressionEngine({
      preserveTypes: options?.preserveTypes ?? true,
      preserveSignatures: options?.preserveSignatures ?? true,
      collapseFunctionBodies: options?.collapseFunctionBodies ?? true,
    });

    return files.map(file => ({
      ...file,
      content: compressor.compress(file.content, file.language),
    }));
  }

  sortFiles(
    files: FileContext[],
    strategy: 'dependency' | 'category' | 'hybrid' = 'hybrid'
  ): FileContext[] {
    const result = this.smartSorter.sort(files, strategy);
    return result.sortedFiles;
  }

  async scoreAndSuggest(
    files: FileContext[],
    maxFiles?: number
  ): Promise<FileContext[]> {
    const scored = await this.relevanceScorer.scoreFiles(files, this.options.workspaceRoot);
    return this.relevanceScorer.suggestFiles(scored, maxFiles);
  }

  async autoSelectRelevant(
    context: ProjectContext,
    targetTokenCount: number = 64000
  ): Promise<ProjectContext> {
    const scored = await this.relevanceScorer.scoreFiles(context.files, this.options.workspaceRoot);
    
    const selected: FileContext[] = [];
    let currentTokens = 0;

    for (const item of scored) {
      const fileTokens = Math.ceil(item.file.content.length / 4);
      if (currentTokens + fileTokens > targetTokenCount) continue;
      
      selected.push(item.file);
      currentTokens += fileTokens;
    }

    return {
      ...context,
      files: selected,
      metadata: {
        ...context.metadata,
        totalFiles: selected.length,
        tokenCount: currentTokens,
      },
    };
  }

  updateWorkspaceRoot(rootPath: string): void {
    this.dependencyGraph = new DependencyGraphAnalyzer(rootPath);
    this.smartSorter = new SmartFileSorter(rootPath, this.dependencyGraph);
  }

  getDependencyGraph(): DependencyGraphAnalyzer {
    return this.dependencyGraph;
  }

  getRelevanceScorer(): ContextRelevanceScorer {
    return this.relevanceScorer;
  }
}

export function createIntelligenceManager(options: IntelligenceOptions): IntelligenceManager {
  return new IntelligenceManager(options);
}
