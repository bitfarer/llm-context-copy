import * as assert from 'assert';
import { FormatComparator } from '../../formatters/FormatComparator';
import { TokenCounter } from '../../token/TokenCounter';
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

suite('FormatComparator Tests', () => {
  test('should compare all formats', () => {
    const tokenCounter = new TokenCounter(4);
    const comparator = new FormatComparator(tokenCounter);
    const context = createTestContext([
      {
        path: 'test.ts',
        content: 'const x = 1;\nconst y = 2;',
      },
    ]);

    const report = comparator.compareAllFormats(context);

    assert.strictEqual(report.results.length, 4);
    assert.ok(report.mostEfficient);
    assert.ok(report.savings.length === 4);

    const formats = report.results.map(r => r.format);
    assert.ok(formats.includes('markdown'));
    assert.ok(formats.includes('json'));
    assert.ok(formats.includes('plain'));
    assert.ok(formats.includes('toon'));
  });

  test('should calculate correct token counts for each format', () => {
    const tokenCounter = new TokenCounter(4);
    const comparator = new FormatComparator(tokenCounter);
    const context = createTestContext([
      {
        path: 'test.ts',
        content: 'const x = 1;',
      },
    ]);

    const report = comparator.compareAllFormats(context);

    for (const result of report.results) {
      assert.ok(result.tokenCount > 0, `${result.format} should have tokens`);
      assert.ok(result.charCount > 0, `${result.format} should have chars`);
      assert.ok(result.lineCount > 0, `${result.format} should have lines`);
      assert.ok(result.sizeBytes > 0, `${result.format} should have size`);
    }
  });

  test('should identify most efficient format', () => {
    const tokenCounter = new TokenCounter(4);
    const comparator = new FormatComparator(tokenCounter);
    const context = createTestContext([
      {
        path: 'test.ts',
        content: 'const x = 1;\nconst y = 2;\nconst z = 3;',
      },
    ]);

    const report = comparator.compareAllFormats(context);

    const minTokens = Math.min(...report.results.map(r => r.tokenCount));
    assert.strictEqual(report.mostEfficient.tokenCount, minTokens);
  });

  test('should calculate savings correctly', () => {
    const tokenCounter = new TokenCounter(4);
    const comparator = new FormatComparator(tokenCounter);
    const context = createTestContext([
      {
        path: 'test.ts',
        content: 'const x = 1;',
      },
    ]);

    const report = comparator.compareAllFormats(context);
    const mostEfficient = report.mostEfficient;

    const mostEfficientSavings = report.savings.find(s => s.format === mostEfficient.format);
    assert.strictEqual(mostEfficientSavings?.tokensSaved, 0);
    assert.strictEqual(mostEfficientSavings?.percentage, 0);
  });

  test('should rate format efficiency as excellent', () => {
    const tokenCounter = new TokenCounter(4);
    const comparator = new FormatComparator(tokenCounter);

    const rating = comparator.getFormatEfficiencyRating('test', 70, 100);

    assert.strictEqual(rating.rating, 'excellent');
    assert.strictEqual(rating.efficiency, 70);
  });

  test('should rate format efficiency as good', () => {
    const tokenCounter = new TokenCounter(4);
    const comparator = new FormatComparator(tokenCounter);

    const rating = comparator.getFormatEfficiencyRating('test', 80, 100);

    assert.strictEqual(rating.rating, 'good');
    assert.strictEqual(rating.efficiency, 80);
  });

  test('should rate format efficiency as fair', () => {
    const tokenCounter = new TokenCounter(4);
    const comparator = new FormatComparator(tokenCounter);

    const rating = comparator.getFormatEfficiencyRating('test', 90, 100);

    assert.strictEqual(rating.rating, 'fair');
    assert.strictEqual(rating.efficiency, 90);
  });

  test('should rate format efficiency as poor', () => {
    const tokenCounter = new TokenCounter(4);
    const comparator = new FormatComparator(tokenCounter);

    const rating = comparator.getFormatEfficiencyRating('test', 100, 100);

    assert.strictEqual(rating.rating, 'poor');
    assert.strictEqual(rating.efficiency, 100);
  });

  test('should handle empty context', () => {
    const tokenCounter = new TokenCounter(4);
    const comparator = new FormatComparator(tokenCounter);
    const context = createTestContext([]);

    const report = comparator.compareAllFormats(context);

    assert.strictEqual(report.results.length, 4);
    for (const result of report.results) {
      assert.strictEqual(result.tokenCount, 0);
    }
  });

  test('TOON format should generally be more efficient than JSON', () => {
    const tokenCounter = new TokenCounter(4);
    const comparator = new FormatComparator(tokenCounter);
    const context = createTestContext([
      {
        path: 'test.ts',
        content: 'const x = 1;\nconst y = 2;\nconst z = 3;',
      },
      {
        path: 'test2.ts',
        content: 'function test() { return 42; }',
      },
    ]);

    const report = comparator.compareAllFormats(context);

    const toonResult = report.results.find(r => r.format === 'toon');
    const jsonResult = report.results.find(r => r.format === 'json');

    assert.ok(toonResult);
    assert.ok(jsonResult);
    assert.ok(
      toonResult.tokenCount <= jsonResult.tokenCount,
      `TOON (${toonResult.tokenCount}) should be <= JSON (${jsonResult.tokenCount})`
    );
  });
});