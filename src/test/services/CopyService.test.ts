import * as assert from 'assert';
import { CopyService } from '../../services/CopyService';
import { CompressionEngineBuilder } from '../../compression/CompressionEngine';
import { RemoveEmptyLinesStrategy, RemoveCommentsStrategy } from '../../compression/CompressionStrategy';
import { TokenCounter } from '../../token/TokenCounter';
import { ErrorHandler } from '../../errors/ContextCopyError';
import { ProjectContext, FormatterOptions } from '../../types';

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

suite('CopyService Tests', () => {
  function createService(): CopyService {
    const tokenCounter = new TokenCounter(4);
    const compressionEngine = new CompressionEngineBuilder(tokenCounter)
      .withStrategy(new RemoveEmptyLinesStrategy())
      .build();

    const formatterOptions: FormatterOptions = {
      outputFormat: 'markdown',
      includeStats: true,
      includeStructure: false,
      collapseEmptyLines: false,
    };

    return new CopyService({
      formatterOptions,
      compressionEngine,
      tokenCounter,
      errorHandler: new ErrorHandler(),
    });
  }

  test('should calculate compression estimate correctly', () => {
    const service = createService();
    const context = createTestContext([
      {
        path: 'test.ts',
        content: 'line1\n\n\n\nline2',
      },
    ]);

    const estimate = service.getCompressionEstimate(context, ['removeEmptyLines']);
    assert.ok(estimate.originalTokens > 0);
    assert.ok(estimate.estimatedTokens > 0);
    assert.ok(estimate.savings >= 0);
    assert.ok(estimate.savingsPercentage >= 0);
  });

  test('should preview content without compression', async () => {
    const service = createService();
    const context = createTestContext([
      {
        path: 'test.ts',
        content: 'const x = 1;',
      },
    ]);

    const preview = await service.previewContent(context, []);
    assert.ok(preview.formattedContent.includes('const x = 1;'));
    assert.ok(preview.originalTokenCount.totalTokens > 0);
    assert.strictEqual(preview.compressionResult, undefined);
  });

  test('should preview content with compression', async () => {
    const service = createService();
    const context = createTestContext([
      {
        path: 'test.ts',
        content: 'line1\n\n\n\nline2',
      },
    ]);

    const preview = await service.previewContent(context, ['removeEmptyLines']);
    assert.ok(preview.formattedContent.includes('line1'));
    assert.ok(preview.compressionResult);
    assert.ok(preview.compressionResult.compressionRatio <= 1.0);
  });

  test('should track original and compressed token counts', async () => {
    const service = createService();
    const originalContent = 'line1\n\n\n\nline2\n\n\nline3';
    const context = createTestContext([
      {
        path: 'test.ts',
        content: originalContent,
      },
    ]);

    const preview = await service.previewContent(context, ['removeEmptyLines']);
    const originalTokens = preview.originalTokenCount.totalTokens;
    const compressedTokens = preview.compressionResult!.compressedTokens;

    assert.ok(originalTokens > 0);
    assert.ok(compressedTokens > 0);
    assert.ok(compressedTokens <= originalTokens);
  });

  test('should show different token counts for different compression strategies', async () => {
    const tokenCounter = new TokenCounter(4);

    const context = createTestContext([
      {
        path: 'test.ts',
        content: 'const x = 1; // comment\n\n\nconst y = 2;',
      },
    ]);

    const engine1 = new CompressionEngineBuilder(tokenCounter)
      .withStrategy(new RemoveEmptyLinesStrategy())
      .build();

    const service1 = new CopyService({
      formatterOptions: { outputFormat: 'markdown' },
      compressionEngine: engine1,
      tokenCounter,
    });

    const preview1 = await service1.previewContent(context, ['removeEmptyLines']);

    const engine2 = new CompressionEngineBuilder(tokenCounter)
      .withStrategy(new RemoveCommentsStrategy())
      .build();

    const service2 = new CopyService({
      formatterOptions: { outputFormat: 'markdown' },
      compressionEngine: engine2,
      tokenCounter,
    });

    const preview2 = await service2.previewContent(context, ['removeComments']);

    assert.notStrictEqual(
      preview1.compressionResult?.compressedTokens,
      preview2.compressionResult?.compressedTokens
    );
  });

  test('should handle empty context', async () => {
    const service = createService();
    const context = createTestContext([]);

    const preview = await service.previewContent(context, []);
    assert.strictEqual(preview.originalTokenCount.totalTokens, 0);
    assert.strictEqual(preview.formattedContent, '');
  });

  test('should calculate correct compression ratio', async () => {
    const service = createService();
    const context = createTestContext([
      {
        path: 'test.ts',
        content: 'a'.repeat(1000),
      },
    ]);

    const preview = await service.previewContent(context, ['removeEmptyLines']);
    const ratio = preview.compressionResult!.compressionRatio;

    assert.ok(ratio >= 0);
    assert.ok(ratio <= 1);
  });
});