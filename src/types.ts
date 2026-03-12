import * as vscode from 'vscode';

export interface FileContext {
  path: string;
  content: string;
  language: string;
  relativePath: string;
  stats: {
    size: number;
    isDirectory: boolean;
  };
}

export interface ProjectContext {
  files: FileContext[];
  structure: DirectoryStructure | null;
  metadata: {
    rootPath: string;
    totalFiles: number;
    totalSize: number;
    tokenCount: number;
    originalTokenCount?: number;
    timestamp: number;
  };
}

export interface DirectoryStructure {
  path: string;
  name: string;
  type: 'file' | 'directory';
  children?: DirectoryStructure[];
  depth: number;
}

export interface ContextExtractorOptions {
  includePatterns?: string[];
  excludePatterns?: string[];
  maxFileSize?: number;
  maxDepth?: number;
  includeHidden?: boolean;
}

export interface FormatterOptions {
  outputFormat: 'markdown' | 'json' | 'plain' | 'toon';
  includeStats?: boolean;
  includeStructure?: boolean;
  collapseEmptyLines?: boolean;
}

export interface TreeItemData {
  uri: vscode.Uri;
  relativePath: string;
  name: string;
  type: 'file' | 'directory';
  size: number;
  tokenCount?: number;
}

export interface CopyResult {
  success: boolean;
  content: string;
  tokenCount: number;
  fileCount: number;
  optimizationsApplied?: string[];
  duration: number;
}

export interface TokenCountInfo {
  originalTokens: number;
  compressedTokens: number;
  compressionRatio: number;
  savings: number;
  savingsPercentage: number;
}

export interface CompressionInfo {
  strategyName: string;
  originalTokens: number;
  compressedTokens: number;
  compressionRatio: number;
  metadata: {
    filesProcessed: number;
    bytesSaved: number;
    durationMs: number;
  };
}

export interface WorkspaceInfo {
  id: string;
  name: string;
  rootPath: string;
  isActive: boolean;
}

export interface SessionMemoryEntry {
  id: string;
  timestamp: number;
  files: SessionFileEntry[];
  totalTokens: number;
  compressionStrategies: string[];
  outputFormat: string;
}

export interface SessionFileEntry {
  path: string;
  content: string;
  lastModified: number;
  isModified: boolean;
  previousContent?: string;
}

export interface TokenBudgetConfig {
  maxTokens: number;
  priorityFiles: string[];
  excludedPatterns: string[];
  autoSelect: boolean;
  compressionPriority: string[];
}

export interface TokenBudgetResult {
  selectedFiles: string[];
  estimatedTokens: number;
  withinBudget: boolean;
  recommendations: string[];
}

export interface PreviewPanelOptions {
  showSyntaxHighlighting: boolean;
  showTokenCount: boolean;
  autoRefresh: boolean;
  theme: 'light' | 'dark';
}

export interface FileChangeInfo {
  path: string;
  status: 'added' | 'modified' | 'deleted' | 'unchanged';
  previousContent?: string;
  currentContent?: string;
}