export const ServiceTokens = {
  ExtensionContext: 'extensionContext',

  ContextManager: 'contextManager',
  CopyService: 'copyService',
  WorkspaceManager: 'workspaceManager',
  SessionMemory: 'sessionMemory',
  TokenBudgetManager: 'tokenBudgetManager',

  TokenCounter: 'tokenCounter',
  TrueTokenizer: 'trueTokenizer',

  CompressionEngine: 'compressionEngine',

  IntelligenceManager: 'intelligenceManager',

  FileWatcherService: 'fileWatcherService',
  SmartCache: 'smartCache',

  Logger: 'logger',
  ErrorHandler: 'errorHandler',

  TreeViewProvider: 'treeViewProvider',
  StatsViewProvider: 'statsViewProvider',
} as const;

export interface ServiceTypes {
  [ServiceTokens.ExtensionContext]: import('vscode').ExtensionContext;
  [ServiceTokens.ContextManager]: import('../services/ContextManager').ContextManager;
  [ServiceTokens.CopyService]: import('../services/CopyService').CopyService;
  [ServiceTokens.WorkspaceManager]: import('../services/WorkspaceManager').WorkspaceManager;
  [ServiceTokens.SessionMemory]: import('../services/SessionMemory').SessionMemory;
  [ServiceTokens.TokenBudgetManager]: import('../services/TokenBudgetManager').TokenBudgetManager;
  [ServiceTokens.TokenCounter]: import('../token/TokenCounter').ITokenCounter;
  [ServiceTokens.TrueTokenizer]: import('../performance/TrueTokenizer').TrueTokenizer;
  [ServiceTokens.CompressionEngine]: import('../compression/CompressionEngine').ICompressionEngine;
  [ServiceTokens.IntelligenceManager]: import('../intelligence/IntelligenceManager').IntelligenceManager;
  [ServiceTokens.FileWatcherService]: import('../performance/FileWatcher').FileWatcherService;
  [ServiceTokens.SmartCache]: import('../performance/FileWatcher').SmartCache;
  [ServiceTokens.Logger]: import('../infrastructure/Logger').ILogger;
  [ServiceTokens.ErrorHandler]: import('../errors/ContextCopyError').ErrorHandler;
  [ServiceTokens.TreeViewProvider]: import('../tree/TreeViewProvider').TreeViewProvider;
  [ServiceTokens.StatsViewProvider]: import('../tree/StatsViewProvider').StatsViewProvider;
}
