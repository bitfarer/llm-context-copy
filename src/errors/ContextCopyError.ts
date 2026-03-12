export enum ErrorCode {
  FILE_READ_ERROR = 'FILE_READ_ERROR',
  FILE_WRITE_ERROR = 'FILE_WRITE_ERROR',
  COMPRESSION_ERROR = 'COMPRESSION_ERROR',
  TOKEN_COUNT_ERROR = 'TOKEN_COUNT_ERROR',
  FORMAT_ERROR = 'FORMAT_ERROR',
  CLIPBOARD_ERROR = 'CLIPBOARD_ERROR',
  INVALID_STRATEGY = 'INVALID_STRATEGY',
  WORKSPACE_NOT_FOUND = 'WORKSPACE_NOT_FOUND',
  NO_FILES_SELECTED = 'NO_FILES_SELECTED',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

export interface ErrorContext {
  filePath?: string;
  strategyName?: string;
  operation?: string;
  [key: string]: unknown;
}

export class ContextCopyError extends Error {
  public readonly code: ErrorCode;
  public readonly context: ErrorContext;
  public readonly timestamp: Date;
  public readonly isRecoverable: boolean;

  constructor(
    message: string,
    code: ErrorCode = ErrorCode.UNKNOWN_ERROR,
    context: ErrorContext = {},
    isRecoverable = false
  ) {
    super(message);
    this.name = 'ContextCopyError';
    this.code = code;
    this.context = context;
    this.timestamp = new Date();
    this.isRecoverable = isRecoverable;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ContextCopyError);
    }
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      context: this.context,
      timestamp: this.timestamp.toISOString(),
      isRecoverable: this.isRecoverable,
      stack: this.stack,
    };
  }

  static fileReadError(filePath: string, originalError?: Error): ContextCopyError {
    return new ContextCopyError(
      `Failed to read file: ${filePath}`,
      ErrorCode.FILE_READ_ERROR,
      { filePath, originalError: originalError?.message },
      false
    );
  }

  static compressionError(strategyName: string, originalError?: Error): ContextCopyError {
    return new ContextCopyError(
      `Compression strategy '${strategyName}' failed`,
      ErrorCode.COMPRESSION_ERROR,
      { strategyName, originalError: originalError?.message },
      true
    );
  }

  static tokenCountError(filePath?: string): ContextCopyError {
    return new ContextCopyError(
      'Failed to count tokens',
      ErrorCode.TOKEN_COUNT_ERROR,
      { filePath },
      true
    );
  }

  static clipboardError(): ContextCopyError {
    return new ContextCopyError(
      'Failed to copy to clipboard',
      ErrorCode.CLIPBOARD_ERROR,
      {},
      true
    );
  }

  static noFilesSelected(): ContextCopyError {
    return new ContextCopyError(
      'No files selected',
      ErrorCode.NO_FILES_SELECTED,
      {},
      true
    );
  }

  static workspaceNotFound(): ContextCopyError {
    return new ContextCopyError(
      'No workspace folder found',
      ErrorCode.WORKSPACE_NOT_FOUND,
      {},
      false
    );
  }
}

export class ErrorHandler {
  private errorLog: ContextCopyError[] = [];
  private maxLogSize = 100;

  handle(error: unknown, showNotification = true): ContextCopyError {
    const contextError = this.normalizeError(error);
    this.logError(contextError);

    if (showNotification) {
      this.showNotification(contextError);
    }

    return contextError;
  }

  private normalizeError(error: unknown): ContextCopyError {
    if (error instanceof ContextCopyError) {
      return error;
    }

    if (error instanceof Error) {
      return new ContextCopyError(
        error.message,
        ErrorCode.UNKNOWN_ERROR,
        { originalError: error.message },
        false
      );
    }

    return new ContextCopyError(
      String(error),
      ErrorCode.UNKNOWN_ERROR,
      {},
      false
    );
  }

  private logError(error: ContextCopyError): void {
    this.errorLog.push(error);
    if (this.errorLog.length > this.maxLogSize) {
      this.errorLog.shift();
    }

    console.error(`[ContextCopyError] ${error.code}: ${error.message}`, error.context);
  }

  private showNotification(error: ContextCopyError): void {
    const message = error.isRecoverable
      ? `⚠️ ${error.message}`
      : `❌ ${error.message}`;

    console.log(message);
  }

  getErrorLog(): ContextCopyError[] {
    return [...this.errorLog];
  }

  clearErrorLog(): void {
    this.errorLog = [];
  }

  getLastError(): ContextCopyError | undefined {
    return this.errorLog[this.errorLog.length - 1];
  }
}

export const globalErrorHandler = new ErrorHandler();
