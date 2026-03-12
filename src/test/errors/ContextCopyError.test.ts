import * as assert from 'assert';
import {
  ContextCopyError,
  ErrorCode,
  ErrorHandler,
} from '../../errors/ContextCopyError';

suite('ContextCopyError Tests', () => {
  test('should create error with default values', () => {
    const error = new ContextCopyError('Test error');
    assert.strictEqual(error.message, 'Test error');
    assert.strictEqual(error.code, ErrorCode.UNKNOWN_ERROR);
    assert.deepStrictEqual(error.context, {});
    assert.strictEqual(error.isRecoverable, false);
    assert.ok(error.timestamp instanceof Date);
  });

  test('should create error with custom values', () => {
    const context = { filePath: '/test/file.ts' };
    const error = new ContextCopyError(
      'Test error',
      ErrorCode.FILE_READ_ERROR,
      context,
      true
    );
    assert.strictEqual(error.code, ErrorCode.FILE_READ_ERROR);
    assert.deepStrictEqual(error.context, context);
    assert.strictEqual(error.isRecoverable, true);
  });

  test('should convert to JSON', () => {
    const error = new ContextCopyError(
      'Test error',
      ErrorCode.FILE_READ_ERROR,
      { filePath: '/test/file.ts' }
    );

    const json = error.toJSON();
    assert.strictEqual(json.name, 'ContextCopyError');
    assert.strictEqual(json.message, 'Test error');
    assert.strictEqual(json.code, ErrorCode.FILE_READ_ERROR);
    assert.ok(json.timestamp);
  });

  test('should create file read error', () => {
    const error = ContextCopyError.fileReadError('/test/file.ts');
    assert.strictEqual(error.code, ErrorCode.FILE_READ_ERROR);
    assert.strictEqual(error.context.filePath, '/test/file.ts');
    assert.strictEqual(error.isRecoverable, false);
  });

  test('should create compression error', () => {
    const originalError = new Error('Original error');
    const error = ContextCopyError.compressionError('testStrategy', originalError);
    assert.strictEqual(error.code, ErrorCode.COMPRESSION_ERROR);
    assert.strictEqual(error.context.strategyName, 'testStrategy');
    assert.strictEqual(error.isRecoverable, true);
  });

  test('should create token count error', () => {
    const error = ContextCopyError.tokenCountError('/test/file.ts');
    assert.strictEqual(error.code, ErrorCode.TOKEN_COUNT_ERROR);
    assert.strictEqual(error.context.filePath, '/test/file.ts');
  });

  test('should create clipboard error', () => {
    const error = ContextCopyError.clipboardError();
    assert.strictEqual(error.code, ErrorCode.CLIPBOARD_ERROR);
    assert.strictEqual(error.isRecoverable, true);
  });

  test('should create no files selected error', () => {
    const error = ContextCopyError.noFilesSelected();
    assert.strictEqual(error.code, ErrorCode.NO_FILES_SELECTED);
    assert.strictEqual(error.isRecoverable, true);
  });

  test('should create workspace not found error', () => {
    const error = ContextCopyError.workspaceNotFound();
    assert.strictEqual(error.code, ErrorCode.WORKSPACE_NOT_FOUND);
    assert.strictEqual(error.isRecoverable, false);
  });
});

suite('ErrorHandler Tests', () => {
  test('should handle ContextCopyError', () => {
    const handler = new ErrorHandler();
    const error = new ContextCopyError('Test error', ErrorCode.FILE_READ_ERROR);

    const result = handler.handle(error, false);
    assert.strictEqual(result.message, 'Test error');
    assert.strictEqual(handler.getErrorLog().length, 1);
  });

  test('should handle generic Error', () => {
    const handler = new ErrorHandler();
    const error = new Error('Generic error');

    const result = handler.handle(error, false);
    assert.strictEqual(result.message, 'Generic error');
    assert.strictEqual(result.code, ErrorCode.UNKNOWN_ERROR);
  });

  test('should handle string error', () => {
    const handler = new ErrorHandler();
    const result = handler.handle('String error', false);
    assert.strictEqual(result.message, 'String error');
  });

  test('should maintain error log with max size', () => {
    const handler = new ErrorHandler();

    for (let i = 0; i < 110; i++) {
      handler.handle(new Error(`Error ${i}`), false);
    }

    const log = handler.getErrorLog();
    assert.ok(log.length <= 100);
  });

  test('should clear error log', () => {
    const handler = new ErrorHandler();
    handler.handle(new Error('Test'), false);

    handler.clearErrorLog();
    assert.strictEqual(handler.getErrorLog().length, 0);
  });

  test('should get last error', () => {
    const handler = new ErrorHandler();
    handler.handle(new Error('First'), false);
    handler.handle(new Error('Second'), false);

    const lastError = handler.getLastError();
    assert.strictEqual(lastError?.message, 'Second');
  });
});
