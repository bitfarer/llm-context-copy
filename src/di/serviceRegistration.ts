import * as vscode from 'vscode';
import { ServiceContainer } from './ServiceContainer';
import { ServiceTokens } from './tokens';
import { createDefaultLogger } from '../infrastructure/Logger';

import { ContextManager } from '../services/ContextManager';
import { CopyService } from '../services/CopyService';
import { WorkspaceManager } from '../services/WorkspaceManager';
import { SessionMemory } from '../services/SessionMemory';
import { TokenBudgetManager } from '../services/TokenBudgetManager';

import { TokenCounterFactory } from '../token/TokenCounter';
import { TrueTokenizer } from '../performance/TrueTokenizer';

import { CompressionEngine, CompressionEngineBuilder } from '../compression/CompressionEngine';
import {
  RemoveEmptyLinesStrategy,
  RemoveCommentsStrategy,
  MinifyWhitespaceStrategy,
  TruncateLongFilesStrategy,
  DeduplicateCodeStrategy,
  PrioritizeImportantFilesStrategy,
} from '../compression/CompressionStrategy';

import { IntelligenceManager } from '../intelligence/IntelligenceManager';

import { FileWatcherService, SmartCache } from '../performance/FileWatcher';

import { TreeViewProvider } from '../tree/TreeViewProvider';
import { StatsViewProvider } from '../tree/StatsViewProvider';

import { ErrorHandler } from '../errors/ContextCopyError';

export function registerServices(container: ServiceContainer, context: vscode.ExtensionContext): void {
  container.registerSingleton(ServiceTokens.ExtensionContext, () => context);

  container.registerSingleton(ServiceTokens.Logger, () => createDefaultLogger(context));

  container.registerSingleton(ServiceTokens.ErrorHandler, () => new ErrorHandler());

  container.registerSingleton(ServiceTokens.TokenCounter, () => {
    const config = vscode.workspace.getConfiguration('llm-context-copy');
    const modelName = config.get<string>('tokenizerModel', 'default');
    return TokenCounterFactory.createForModel(modelName);
  });

  container.registerSingleton(ServiceTokens.TrueTokenizer, () => {
    const config = vscode.workspace.getConfiguration('llm-context-copy');
    const modelName = config.get<string>('tokenizerModel', 'default');
    return new TrueTokenizer(modelName);
  });

  container.registerSingleton(ServiceTokens.CompressionEngine, () => {
    const tokenCounter = container.resolve(ServiceTokens.TokenCounter) as import('../token/TokenCounter').ITokenCounter;
    const builder = new CompressionEngineBuilder(tokenCounter);
    builder.withStrategy(new RemoveEmptyLinesStrategy());
    builder.withStrategy(new RemoveCommentsStrategy());
    builder.withStrategy(new MinifyWhitespaceStrategy());
    builder.withStrategy(new TruncateLongFilesStrategy());
    builder.withStrategy(new DeduplicateCodeStrategy());
    builder.withStrategy(new PrioritizeImportantFilesStrategy());
    return builder.build();
  });

  container.registerSingleton(ServiceTokens.ContextManager, () => {
    return new ContextManager(context);
  });

  container.registerSingleton(ServiceTokens.CopyService, () => {
    const contextManager = container.resolve(ServiceTokens.ContextManager) as import('../services/ContextManager').ContextManager;
    const tokenCounter = container.resolve(ServiceTokens.TokenCounter) as import('../token/TokenCounter').ITokenCounter;
    const compressionEngine = container.resolve(ServiceTokens.CompressionEngine) as import('../compression/CompressionEngine').ICompressionEngine;
    const errorHandler = container.resolve(ServiceTokens.ErrorHandler) as ErrorHandler;

    return new CopyService({
      formatterOptions: {
        outputFormat: contextManager.getOutputFormat() as any,
        includeStats: true,
        includeStructure: false,
        collapseEmptyLines: false,
      },
      compressionEngine,
      tokenCounter,
      errorHandler,
    });
  });

  container.registerSingleton(ServiceTokens.WorkspaceManager, () => {
    return new WorkspaceManager(context);
  });

  container.registerSingleton(ServiceTokens.SessionMemory, () => {
    return new SessionMemory(context);
  });

  container.registerSingleton(ServiceTokens.TokenBudgetManager, () => {
    const tokenCounter = container.resolve(ServiceTokens.TokenCounter) as import('../token/TokenCounter').ITokenCounter;
    return new TokenBudgetManager(tokenCounter);
  });

  container.registerSingleton(ServiceTokens.IntelligenceManager, () => {
    const contextManager = container.resolve(ServiceTokens.ContextManager) as import('../services/ContextManager').ContextManager;
    const root = contextManager.getWorkspaceRoot();
    const tokenCounter = container.resolve(ServiceTokens.TokenCounter) as import('../token/TokenCounter').ITokenCounter;

    if (!root) {
      throw new Error('No workspace root available');
    }

    return new IntelligenceManager({
      workspaceRoot: root,
      tokenCounter,
    });
  });

  container.registerSingleton(ServiceTokens.FileWatcherService, () => {
    return new FileWatcherService();
  });

  container.registerSingleton(ServiceTokens.SmartCache, () => {
    return new SmartCache(300000);
  });

  container.registerSingleton(ServiceTokens.TreeViewProvider, () => {
    const contextManager = container.resolve(ServiceTokens.ContextManager) as import('../services/ContextManager').ContextManager;
    const workspaceManager = container.tryResolve(ServiceTokens.WorkspaceManager) as import('../services/WorkspaceManager').WorkspaceManager | undefined;
    const sessionMemory = container.tryResolve(ServiceTokens.SessionMemory) as import('../services/SessionMemory').SessionMemory | undefined;
    const tokenBudgetManager = container.tryResolve(ServiceTokens.TokenBudgetManager) as import('../services/TokenBudgetManager').TokenBudgetManager | undefined;

    return new TreeViewProvider(context, contextManager, workspaceManager, sessionMemory, tokenBudgetManager);
  });

  container.registerSingleton(ServiceTokens.StatsViewProvider, () => {
    const contextManager = container.resolve(ServiceTokens.ContextManager) as import('../services/ContextManager').ContextManager;
    const tokenCounter = container.resolve(ServiceTokens.TokenCounter) as import('../token/TokenCounter').ITokenCounter;
    return new StatsViewProvider(contextManager, tokenCounter);
  });
}

export function initializeLazyServices(container: ServiceContainer): void {
  const contextManager = container.resolve(ServiceTokens.ContextManager) as import('../services/ContextManager').ContextManager;
  const root = contextManager.getWorkspaceRoot();

  if (!root) {
    return;
  }

  try {
    const fileWatcher = container.resolve(ServiceTokens.FileWatcherService) as import('../performance/FileWatcher').FileWatcherService;
    const smartCache = container.resolve(ServiceTokens.SmartCache) as import('../performance/FileWatcher').SmartCache;
    
    fileWatcher.start(root);
    fileWatcher.onDidChange((events: Array<{ path: string }>) => {
      for (const event of events) {
        smartCache.invalidate(event.path);
      }
      contextManager.refresh();
    });
  } catch (error) {
    console.warn('Failed to start file watcher:', error);
  }
}
