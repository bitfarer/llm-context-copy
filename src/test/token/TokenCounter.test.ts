import * as assert from 'assert';
import { TokenCounter, TokenCounterFactory } from '../../token/TokenCounter';
import { FileContext, ProjectContext } from '../../types';

suite('TokenCounter Tests', () => {
  test('should count tokens for simple text', () => {
    const counter = new TokenCounter(4);
    const text = 'Hello World';
    const tokens = counter.countTokens(text);
    assert.strictEqual(tokens, 3);
  });

  test('should count tokens for empty string', () => {
    const counter = new TokenCounter(4);
    const tokens = counter.countTokens('');
    assert.strictEqual(tokens, 0);
  });

  test('should count tokens for null/undefined', () => {
    const counter = new TokenCounter(4);
    assert.strictEqual(counter.countTokens(''), 0);
  });

  test('should count file tokens', () => {
    const counter = new TokenCounter(4);
    const file: FileContext = {
      path: '/test/file.ts',
      content: 'function test() { return "hello"; }',
      language: 'typescript',
      relativePath: 'file.ts',
      stats: { size: 35, isDirectory: false },
    };
    const tokens = counter.countFileTokens(file);
    assert.strictEqual(tokens, 9);
  });

  test('should estimate tokens from byte length', () => {
    const counter = new TokenCounter(4);
    assert.strictEqual(counter.estimateTokensFromBytes(0), 0);
    assert.strictEqual(counter.estimateTokensFromBytes(9), 3);
  });

  test('should count project tokens', () => {
    const counter = new TokenCounter(4);
    const context: ProjectContext = {
      files: [
        {
          path: '/test/file1.ts',
          content: 'const a = 1;',
          language: 'typescript',
          relativePath: 'file1.ts',
          stats: { size: 12, isDirectory: false },
        },
        {
          path: '/test/file2.ts',
          content: 'const b = 2;',
          language: 'typescript',
          relativePath: 'file2.ts',
          stats: { size: 12, isDirectory: false },
        },
      ],
      structure: null,
      metadata: {
        rootPath: '/test',
        totalFiles: 2,
        totalSize: 24,
        tokenCount: 0,
        timestamp: Date.now(),
      },
    };

    const result = counter.countProjectTokens(context);
    assert.strictEqual(result.totalTokens, 6);
    assert.strictEqual(result.fileTokens.get('file1.ts'), 3);
    assert.strictEqual(result.fileTokens.get('file2.ts'), 3);
    assert.strictEqual(result.details.charCount, 24);
  });

  test('should create default counter', () => {
    const counter = TokenCounterFactory.createDefault();
    const tokens = counter.countTokens('test');
    assert.strictEqual(tokens, 1);
  });

  test('should create counter for GPT-4 model', () => {
    const counter = TokenCounterFactory.createForModel('gpt-4');
    const tokens = counter.countTokens('test');
    assert.strictEqual(tokens, 1);
  });

  test('should create counter for unknown model', () => {
    const counter = TokenCounterFactory.createForModel('unknown-model');
    const tokens = counter.countTokens('test');
    assert.strictEqual(tokens, 1);
  });
});
