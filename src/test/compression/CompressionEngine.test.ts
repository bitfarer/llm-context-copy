import * as assert from 'assert';
import { CompressionEngine, CompressionEngineBuilder } from '../../compression/CompressionEngine';
import { RemoveEmptyLinesStrategy, RemoveCommentsStrategy } from '../../compression/CompressionStrategy';
import { TokenCounter } from '../../token/TokenCounter';
import { ProjectContext, FileContext } from '../../types';

function createTestContext(files: Array<{ path: string; content: string }>): ProjectContext {
  return {
    files: files.map(f => ({
      path: `/test/${f.path}`,
      content: f.content,
      language: 'typescript',
      relativePath: f.path,
      stats: { size: Buffer.byteLength(f.content, 'utf-8'), isDirectory: false },
    })),
    structure: null,
    metadata: {
      rootPath: '/test',
      totalFiles: files.length,
      totalSize: files.reduce((sum, f) => sum + Buffer.byteLength(f.content, 'utf-8'), 0),
      tokenCount: 0,
      timestamp: Date.now(),
    },
  };
}

suite('CompressionEngine Tests', () => {
  test('should register and unregister strategies', () => {
    const tokenCounter = new TokenCounter(4);
    const engine = new CompressionEngine(tokenCounter);
    const strategy = new RemoveEmptyLinesStrategy();

    engine.registerStrategy(strategy);
    assert.strictEqual(engine.getStrategies().length, 1);

    const unregistered = engine.unregisterStrategy(strategy.name);
    assert.strictEqual(unregistered, true);
    assert.strictEqual(engine.getStrategies().length, 0);
  });

  test('should toggle strategy enabled state', () => {
    const tokenCounter = new TokenCounter(4);
    const engine = new CompressionEngine(tokenCounter);
    const strategy = new RemoveEmptyLinesStrategy();

    engine.registerStrategy(strategy);
    assert.strictEqual(strategy.isEnabled, true);

    engine.toggleStrategy(strategy.name, false);
    assert.strictEqual(strategy.isEnabled, false);

    engine.toggleStrategy(strategy.name, true);
    assert.strictEqual(strategy.isEnabled, true);
  });

  test('should compress with enabled strategies', async () => {
    const tokenCounter = new TokenCounter(4);
    const engine = new CompressionEngine(tokenCounter);
    const strategy = new RemoveEmptyLinesStrategy();

    engine.registerStrategy(strategy);

    const context = createTestContext([
      {
        path: 'test.ts',
        content: 'line1\n\n\n\nline2',
      },
    ]);

    const result = await engine.compress(context);
    assert.strictEqual(result.strategyName, 'removeEmptyLines');
    assert.ok(result.compressionRatio <= 1.0);
    assert.ok(result.metadata.durationMs >= 0);
    assert.strictEqual(result.metadata.filesProcessed, 1);
  });

  test('should compress with specific strategies', async () => {
    const tokenCounter = new TokenCounter(4);
    const engine = new CompressionEngine(tokenCounter);
    const strategy1 = new RemoveEmptyLinesStrategy();
    const strategy2 = new RemoveCommentsStrategy();

    engine.registerStrategy(strategy1);
    engine.registerStrategy(strategy2);

    const context = createTestContext([
      {
        path: 'test.ts',
        content: 'line1\n\n\n\nline2 // comment',
      },
    ]);

    const result = await engine.compressWithStrategies(context, ['removeEmptyLines', 'removeComments']);
    assert.ok(result.strategyName.includes('removeEmptyLines'));
    assert.ok(result.strategyName.includes('removeComments'));
  });

  test('should estimate compression', () => {
    const tokenCounter = new TokenCounter(4);
    const engine = new CompressionEngine(tokenCounter);
    const strategy = new RemoveEmptyLinesStrategy();

    engine.registerStrategy(strategy);

    const context = createTestContext([
      {
        path: 'test.ts',
        content: 'line1\n\n\n\nline2',
      },
    ]);

    const estimate = engine.estimateCompression(context, ['removeEmptyLines']);
    assert.ok(estimate.originalTokens > 0);
    assert.ok(estimate.estimatedTokens > 0);
    assert.ok(estimate.estimatedRatio <= 1.0);
    assert.strictEqual(estimate.strategies.length, 1);
  });

  test('should handle compression errors gracefully', async () => {
    const tokenCounter = new TokenCounter(4);
    const engine = new CompressionEngine(tokenCounter);

    const errorStrategy = new RemoveEmptyLinesStrategy();
    errorStrategy.apply = async () => {
      throw new Error('Test error');
    };

    engine.registerStrategy(errorStrategy);

    const context = createTestContext([
      {
        path: 'test.ts',
        content: 'line1\n\n\n\nline2',
      },
    ]);

    const result = await engine.compress(context);
    assert.strictEqual(result.compressionRatio, 1.0);
  });

  test('should build engine with builder pattern', () => {
    const tokenCounter = new TokenCounter(4);
    const engine = new CompressionEngineBuilder(tokenCounter)
      .withStrategy(new RemoveEmptyLinesStrategy())
      .withStrategy(new RemoveCommentsStrategy())
      .withOptions({ targetTokenLimit: 1000 })
      .build();

    assert.strictEqual(engine.getStrategies().length, 2);
  });

  test('should calculate correct token counts after compression', async () => {
    const tokenCounter = new TokenCounter(4);
    const engine = new CompressionEngine(tokenCounter);
    const strategy = new RemoveEmptyLinesStrategy();

    engine.registerStrategy(strategy);

    const longContent = 'a'.repeat(1000);
    const context = createTestContext([
      {
        path: 'test.ts',
        content: longContent,
      },
    ]);

    const result = await engine.compress(context);
    const expectedOriginalTokens = Math.ceil(longContent.length / 4);
    assert.strictEqual(result.originalTokens, expectedOriginalTokens);
  });
});
