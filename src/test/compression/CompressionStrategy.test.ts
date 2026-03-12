import * as assert from 'assert';
import {
  RemoveEmptyLinesStrategy,
  RemoveCommentsStrategy,
  MinifyWhitespaceStrategy,
  TruncateLongFilesStrategy,
  DeduplicateCodeStrategy,
  PrioritizeImportantFilesStrategy,
} from '../../compression/CompressionStrategy';
import { ProjectContext } from '../../types';

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

suite('Compression Strategy Tests', () => {
  suite('RemoveEmptyLinesStrategy', () => {
    test('should remove consecutive empty lines (3+) down to one', async () => {
      const strategy = new RemoveEmptyLinesStrategy();
      const context = createTestContext([
        {
          path: 'test.ts',
          content: 'line1\n\n\n\nline2',
        },
      ]);

      const result = await strategy.apply(context);
      assert.strictEqual(result.files[0].content, 'line1\n\nline2');
    });

    test('should keep single empty line unchanged', async () => {
      const strategy = new RemoveEmptyLinesStrategy();
      const context = createTestContext([
        {
          path: 'test.ts',
          content: 'line1\n\nline2',
        },
      ]);

      const result = await strategy.apply(context);
      assert.strictEqual(result.files[0].content, 'line1\n\nline2');
    });

    test('should handle many consecutive empty lines', async () => {
      const strategy = new RemoveEmptyLinesStrategy();
      const context = createTestContext([
        {
          path: 'test.ts',
          content: 'line1\n\n\n\n\n\n\nline2',
        },
      ]);

      const result = await strategy.apply(context);
      assert.strictEqual(result.files[0].content, 'line1\n\nline2');
    });

    test('should estimate compression ratio', () => {
      const strategy = new RemoveEmptyLinesStrategy();
      const context = createTestContext([
        {
          path: 'test.ts',
          content: 'line1\n\n\n\nline2\n\n\nline3',
        },
      ]);

      const ratio = strategy.estimateCompressionRatio(context);
      assert.ok(ratio < 1.0);
      assert.ok(ratio > 0);
    });
  });

  suite('RemoveCommentsStrategy', () => {
    test('should remove single-line comments', async () => {
      const strategy = new RemoveCommentsStrategy();
      const context = createTestContext([
        {
          path: 'test.ts',
          content: 'const x = 1; // this is a comment',
        },
      ]);

      const result = await strategy.apply(context);
      assert.strictEqual(result.files[0].content.trim(), 'const x = 1;');
    });

    test('should remove multi-line comments', async () => {
      const strategy = new RemoveCommentsStrategy();
      const context = createTestContext([
        {
          path: 'test.ts',
          content: '/* start comment\nend comment */ const x = 1;',
        },
      ]);

      const result = await strategy.apply(context);
      assert.strictEqual(result.files[0].content.trim(), 'const x = 1;');
    });

    test('should remove hash comments', async () => {
      const strategy = new RemoveCommentsStrategy();
      const context = createTestContext([
        {
          path: 'test.py',
          content: '# this is a comment\nprint("hello")',
        },
      ]);

      const result = await strategy.apply(context);
      assert.strictEqual(result.files[0].content.trim(), 'print("hello")');
    });

    test('should estimate compression ratio with comments', () => {
      const strategy = new RemoveCommentsStrategy();
      const context = createTestContext([
        {
          path: 'test.ts',
          content: 'const x = 1; // comment\n/* block */ const y = 2;',
        },
      ]);

      const ratio = strategy.estimateCompressionRatio(context);
      assert.ok(ratio < 1.0);
    });
  });

  suite('MinifyWhitespaceStrategy', () => {
    test('should minify whitespace', async () => {
      const strategy = new MinifyWhitespaceStrategy();
      const context = createTestContext([
        {
          path: 'test.ts',
          content: '  line1  \n\n  line2  ',
        },
      ]);

      const result = await strategy.apply(context);
      assert.strictEqual(result.files[0].content, 'line1 line2');
    });

    test('should estimate compression ratio', () => {
      const strategy = new MinifyWhitespaceStrategy();
      const context = createTestContext([
        {
          path: 'test.ts',
          content: '  line1  \n\n  line2  ',
        },
      ]);

      const ratio = strategy.estimateCompressionRatio(context);
      assert.ok(ratio < 1.0);
    });
  });

  suite('TruncateLongFilesStrategy', () => {
    test('should not truncate short files', async () => {
      const strategy = new TruncateLongFilesStrategy();
      const context = createTestContext([
        {
          path: 'test.ts',
          content: Array(50).fill('line').join('\n'),
        },
      ]);

      const result = await strategy.apply(context);
      assert.strictEqual(result.files[0].content.split('\n').length, 50);
    });

    test('should truncate long files', async () => {
      const strategy = new TruncateLongFilesStrategy();
      const context = createTestContext([
        {
          path: 'test.ts',
          content: Array(200).fill('line').join('\n'),
        },
      ]);

      const result = await strategy.apply(context);
      assert.ok(result.files[0].content.includes('// ... (truncated)'));
    });
  });

  suite('DeduplicateCodeStrategy', () => {
    test('should deduplicate identical code blocks', async () => {
      const strategy = new DeduplicateCodeStrategy();
      const duplicateCode = 'const x = 1;';
      const context = createTestContext([
        {
          path: 'test.ts',
          content: `${duplicateCode}\n\n${duplicateCode}`,
        },
      ]);

      const result = await strategy.apply(context);
      assert.ok(result.files[0].content.includes('const x = 1;'));
    });
  });

  suite('PrioritizeImportantFilesStrategy', () => {
    test('should prioritize important files', async () => {
      const strategy = new PrioritizeImportantFilesStrategy();
      const context = createTestContext([
        {
          path: 'test.spec.ts',
          content: 'test code',
        },
        {
          path: 'index.ts',
          content: 'main code',
        },
      ]);

      const result = await strategy.apply(context);
      assert.ok(result.files.length > 0);
    });

    test('should estimate compression ratio based on budget', () => {
      const strategy = new PrioritizeImportantFilesStrategy();
      const context = createTestContext([
        {
          path: 'file1.ts',
          content: 'a'.repeat(100000),
        },
      ]);

      const ratio = strategy.estimateCompressionRatio(context);
      assert.ok(ratio <= 1.0);
    });
  });
});