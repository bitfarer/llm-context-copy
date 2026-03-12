import { FileContext } from '../types';
import { DependencyGraph, DependencyGraphAnalyzer } from './DependencyGraph';

export interface SortResult {
  sortedFiles: FileContext[];
  order: string[];
  categories: FileCategory[];
}

export interface FileCategory {
  name: string;
  files: string[];
  priority: number;
}

type CategoryType = 'types' | 'interfaces' | 'constants' | 'utilities' | 'services' | 'components' | 'hooks' | 'pages' | 'tests' | 'configs' | 'other';

export class SmartFileSorter {
  private workspaceRoot: string;
  private dependencyGraph?: DependencyGraphAnalyzer;
  private categoryPatterns: Map<CategoryType, RegExp[]>;

  constructor(workspaceRoot: string, dependencyGraph?: DependencyGraphAnalyzer) {
    this.workspaceRoot = workspaceRoot;
    this.dependencyGraph = dependencyGraph;
    this.categoryPatterns = this.initCategoryPatterns();
  }

  private initCategoryPatterns(): Map<CategoryType, RegExp[]> {
    return new Map([
      ['types', [
        /types\//i,
        /\/types\//i,
        /\.types\./i,
        /\.d\.ts$/i,
        /interface\s+\w+/i,
        /type\s+\w+\s*=/i,
      ]],
      ['interfaces', [
        /interfaces\//i,
        /\/interfaces\//i,
      ]],
      ['constants', [
        /constants\//i,
        /\/constants\//i,
        /config\//i,
        /\/config\//i,
        /^const\s+\w+.*=/im,
      ]],
      ['utilities', [
        /utils\//i,
        /\/utils\//i,
        /helpers\//i,
        /\/helpers\//i,
        /lib\//i,
        /\/lib\//i,
      ]],
      ['services', [
        /services\//i,
        /\/services\//i,
        /api\//i,
        /\/api\//i,
      ]],
      ['components', [
        /components\//i,
        /\/components\//i,
      ]],
      ['hooks', [
        /hooks\//i,
        /\/hooks\//i,
        /^use\w+\s*\(/im,
      ]],
      ['pages', [
        /pages\//i,
        /\/pages\//i,
        /views\//i,
        /\/views\//i,
        /screens\//i,
        /\/screens\//i,
      ]],
      ['tests', [
        /test[s]?\//i,
        /\/test[s]?\//i,
        /spec[s]?\//i,
        /\/spec[s]?\//i,
        /\.test\./i,
        /\.spec\./i,
        /\.spec\.tsx?$/i,
        /\.test\.tsx?$/i,
      ]],
      ['configs', [
        /\.config\./i,
        /config\./i,
        /\.conf\./i,
      ]],
    ]);
  }

  sort(files: FileContext[], strategy: 'dependency' | 'category' | 'hybrid' = 'hybrid'): SortResult {
    switch (strategy) {
      case 'dependency':
        return this.sortByDependency(files);
      case 'category':
        return this.sortByCategory(files);
      case 'hybrid':
      default:
        return this.sortHybrid(files);
    }
  }

  private sortByDependency(files: FileContext[]): SortResult {
    if (!this.dependencyGraph) {
      return this.sortByCategory(files);
    }

    const filePaths = files.map(f => f.relativePath);
    this.dependencyGraph.buildGraphForFiles(files.map(f => f.path));

    const graph = this.dependencyGraph.getGraph();
    const inDegree = new Map<string, number>();
    const adjacency = new Map<string, string[]>();

    for (const file of filePaths) {
      inDegree.set(file, 0);
      adjacency.set(file, []);
    }

    graph.edges.forEach((deps, source) => {
      for (const dep of deps) {
        if (inDegree.has(dep)) {
          inDegree.set(dep, (inDegree.get(dep) || 0) + 1);
          adjacency.get(source)?.push(dep);
        }
      }
    });

    const queue: string[] = [];
    inDegree.forEach((degree, file) => {
      if (degree === 0) {
        queue.push(file);
      }
    });

    const sorted: string[] = [];
    while (queue.length > 0) {
      const current = queue.shift()!;
      sorted.push(current);

      const neighbors = adjacency.get(current) || [];
      for (const neighbor of neighbors) {
        const newDegree = (inDegree.get(neighbor) || 1) - 1;
        inDegree.set(neighbor, newDegree);
        if (newDegree === 0) {
          queue.push(neighbor);
        }
      }
    }

    for (const file of filePaths) {
      if (!sorted.includes(file)) {
        sorted.push(file);
      }
    }

    const fileMap = new Map(files.map(f => [f.relativePath, f]));
    const sortedFiles = sorted
      .map(p => fileMap.get(p))
      .filter((f): f is FileContext => f !== undefined);

    return {
      sortedFiles,
      order: sorted,
      categories: [],
    };
  }

  private sortByCategory(files: FileContext[]): SortResult {
    const categories: Map<CategoryType, string[]> = new Map();
    const categoryOrder: CategoryType[] = ['types', 'interfaces', 'constants', 'configs', 'utilities', 'services', 'components', 'hooks', 'pages', 'tests', 'other'];

    for (const cat of categoryOrder) {
      categories.set(cat, []);
    }

    for (const file of files) {
      const category = this.categorizeFile(file.relativePath);
      categories.get(category)?.push(file.relativePath);
    }

    const sortedOrder: string[] = [];
    const resultCategories: FileCategory[] = [];

    categoryOrder.forEach((cat, index) => {
      const catFiles = categories.get(cat) || [];
      if (catFiles.length > 0) {
        sortedOrder.push(...catFiles);
        resultCategories.push({
          name: cat,
          files: catFiles,
          priority: index,
        });
      }
    });

    const fileMap = new Map(files.map(f => [f.relativePath, f]));
    const sortedFiles = sortedOrder
      .map(p => fileMap.get(p))
      .filter((f): f is FileContext => f !== undefined);

    return {
      sortedFiles,
      order: sortedOrder,
      categories: resultCategories,
    };
  }

  private sortHybrid(files: FileContext[]): SortResult {
    const categoryResult = this.sortByCategory(files);
    
    if (this.dependencyGraph) {
      const typeFiles = categoryResult.categories.find(c => c.name === 'types')?.files || [];
      const interfaceFiles = categoryResult.categories.find(c => c.name === 'interfaces')?.files || [];
      const coreFiles = [...typeFiles, ...interfaceFiles];

      if (coreFiles.length > 0) {
        const fileMap = new Map(files.map(f => [f.relativePath, f]));
        const coreGraphFiles = coreFiles
          .map(p => fileMap.get(p))
          .filter((f): f is FileContext => f !== undefined && !!f.path)
          .map(f => f.path);

        this.dependencyGraph.buildGraphForFiles(coreGraphFiles);
        const coreSorted = this.dependencyGraph.getGraph().nodes;

        const sortedCore = [...coreSorted.keys()].filter(k => coreFiles.includes(k));
        
        const remaining = categoryResult.order.filter(f => !sortedCore.includes(f));
        const finalOrder = [...sortedCore, ...remaining];

        const finalFiles = finalOrder
          .map(p => fileMap.get(p))
          .filter((f): f is FileContext => f !== undefined);

        return {
          sortedFiles: finalFiles,
          order: finalOrder,
          categories: categoryResult.categories,
        };
      }
    }

    return categoryResult;
  }

  private categorizeFile(filePath: string): CategoryType {
    const normalizedPath = filePath.toLowerCase().replace(/\\/g, '/');

    for (const [category, patterns] of this.categoryPatterns) {
      for (const pattern of patterns) {
        if (pattern.test(normalizedPath)) {
          return category;
        }
      }
    }

    return 'other';
  }

  groupByCategory(files: FileContext[]): Map<CategoryType, FileContext[]> {
    const groups = new Map<CategoryType, FileContext[]>();

    for (const file of files) {
      const category = this.categorizeFile(file.relativePath);
      if (!groups.has(category)) {
        groups.set(category, []);
      }
      groups.get(category)!.push(file);
    }

    return groups;
  }
}

export function createSmartSorter(workspaceRoot: string, dependencyGraph?: DependencyGraphAnalyzer): SmartFileSorter {
  return new SmartFileSorter(workspaceRoot, dependencyGraph);
}
