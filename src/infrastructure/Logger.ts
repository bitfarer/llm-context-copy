import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  NONE = 4,
}

export interface ILogger {
  debug(message: string, ...args: any[]): void;
  info(message: string, ...args: any[]): void;
  warn(message: string, ...args: any[]): void;
  error(message: string, error?: Error, ...args: any[]): void;
  setLevel(level: LogLevel): void;
  getLevel(): LogLevel;
}

export interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  args: any[];
  error?: {
    message: string;
    stack?: string;
    code?: string;
  };
}

export class Logger implements ILogger {
  private level: LogLevel = LogLevel.INFO;
  private outputChannel: vscode.OutputChannel;
  private logFilePath?: string;
  private maxLogSize: number = 5 * 1024 * 1024; // 5MB
  private maxLogFiles: number = 3;

  constructor(
    private name: string = 'LLM Context Copy',
    options?: {
      level?: LogLevel;
      logToFile?: boolean;
      logFilePath?: string;
    }
  ) {
    this.outputChannel = vscode.window.createOutputChannel(this.name);
    
    if (options?.level !== undefined) {
      this.level = options.level;
    }

    if (options?.logToFile && options?.logFilePath) {
      this.logFilePath = options.logFilePath;
    }

    this.loadConfiguration();
  }

  private loadConfiguration(): void {
    const config = vscode.workspace.getConfiguration('llm-context-copy');
    const configLevel = config.get<string>('logLevel', 'info');
    this.level = this.parseLogLevel(configLevel);
  }

  private parseLogLevel(level: string): LogLevel {
    switch (level.toLowerCase()) {
      case 'debug': return LogLevel.DEBUG;
      case 'info': return LogLevel.INFO;
      case 'warn': return LogLevel.WARN;
      case 'error': return LogLevel.ERROR;
      case 'none': return LogLevel.NONE;
      default: return LogLevel.INFO;
    }
  }

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  getLevel(): LogLevel {
    return this.level;
  }

  debug(message: string, ...args: any[]): void {
    this.log(LogLevel.DEBUG, message, ...args);
  }

  info(message: string, ...args: any[]): void {
    this.log(LogLevel.INFO, message, ...args);
  }

  warn(message: string, ...args: any[]): void {
    this.log(LogLevel.WARN, message, ...args);
  }

  error(message: string, error?: Error, ...args: any[]): void {
    this.log(LogLevel.ERROR, message, ...args, error);
  }

  private log(level: LogLevel, message: string, ...args: any[]): void {
    if (level < this.level) {
      return;
    }

    const timestamp = new Date().toISOString();
    const levelName = LogLevel[level];
    const error = args.find(arg => arg instanceof Error) as Error | undefined;
    const otherArgs = args.filter(arg => !(arg instanceof Error));

    const logEntry: LogEntry = {
      timestamp,
      level: levelName,
      message,
      args: otherArgs,
    };

    if (error) {
      logEntry.error = {
        message: error.message,
        stack: error.stack,
        code: (error as any).code,
      };
    }

    // 输出到 OutputChannel
    const formattedMessage = this.formatLogEntry(logEntry);
    this.outputChannel.appendLine(formattedMessage);

    // 输出到控制台（开发时有用）
    if (level >= LogLevel.WARN) {
      console[level === LogLevel.ERROR ? 'error' : 'warn'](formattedMessage);
    }

    // 异步写入文件
    if (this.logFilePath) {
      this.writeToFile(logEntry).catch(err => {
        console.error('Failed to write log to file:', err);
      });
    }
  }

  private formatLogEntry(entry: LogEntry): string {
    let message = `[${entry.timestamp}] [${entry.level}] ${entry.message}`;
    
    if (entry.args.length > 0) {
      const argsStr = entry.args.map(arg => {
        if (typeof arg === 'object') {
          return JSON.stringify(arg);
        }
        return String(arg);
      }).join(' ');
      message += ` ${argsStr}`;
    }

    if (entry.error) {
      message += `\n  Error: ${entry.error.message}`;
      if (entry.error.stack) {
        message += `\n  Stack: ${entry.error.stack}`;
      }
      if (entry.error.code) {
        message += `\n  Code: ${entry.error.code}`;
      }
    }

    return message;
  }

  private async writeToFile(entry: LogEntry): Promise<void> {
    if (!this.logFilePath) return;

    try {
      // 检查日志文件大小
      const stats = await fs.stat(this.logFilePath).catch(() => null);
      if (stats && stats.size > this.maxLogSize) {
        await this.rotateLogFiles();
      }

      // 写入日志
      const line = this.formatLogEntry(entry) + '\n';
      await fs.appendFile(this.logFilePath, line, 'utf-8');
    } catch (error) {
      // 日志写入失败不应影响主功能
      console.error('Failed to write log:', error);
    }
  }

  private async rotateLogFiles(): Promise<void> {
    if (!this.logFilePath) return;

    const basePath = this.logFilePath;
    const ext = path.extname(basePath);
    const baseName = basePath.slice(0, -ext.length);

    // 删除最旧的日志文件
    const oldestLog = `${baseName}.${this.maxLogFiles}${ext}`;
    await fs.unlink(oldestLog).catch(() => {});

    // 重命名其他日志文件
    for (let i = this.maxLogFiles - 1; i >= 1; i--) {
      const oldPath = i === 1 ? basePath : `${baseName}.${i - 1}${ext}`;
      const newPath = `${baseName}.${i}${ext}`;
      await fs.rename(oldPath, newPath).catch(() => {});
    }
  }

  show(): void {
    this.outputChannel.show();
  }

  dispose(): void {
    this.outputChannel.dispose();
  }

  /**
   * 清除所有日志
   */
  async clearLogs(): Promise<void> {
    this.outputChannel.clear();
    
    if (this.logFilePath) {
      try {
        await fs.unlink(this.logFilePath);
      } catch {
        // 文件可能不存在，忽略错误
      }
    }
  }
}

/**
 * 创建默认日志记录器
 */
export function createDefaultLogger(context?: vscode.ExtensionContext): ILogger {
  let logFilePath: string | undefined;
  
  if (context) {
    const logDir = path.join(context.logPath);
    logFilePath = path.join(logDir, 'extension.log');
    
    // 确保日志目录存在
    fs.mkdir(logDir, { recursive: true }).catch(() => {});
  }

  return new Logger('LLM Context Copy', {
    logToFile: !!logFilePath,
    logFilePath,
  });
}

/**
 * 静默日志记录器（用于测试）
 */
export class SilentLogger implements ILogger {
  debug(): void {}
  info(): void {}
  warn(): void {}
  error(): void {}
  setLevel(): void {}
  getLevel(): LogLevel { return LogLevel.NONE; }
}
