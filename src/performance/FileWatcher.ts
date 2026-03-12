import * as vscode from 'vscode';
import * as path from 'path';

export interface FileChangeEvent {
  type: 'created' | 'changed' | 'deleted' | 'renamed';
  path: string;
  oldPath?: string;
  timestamp: number;
}

export interface FileWatcherOptions {
  ignorePatterns: string[];
  debounceMs: number;
  maxQueueSize: number;
}

export type FileChangeCallback = (events: FileChangeEvent[]) => void;

export class FileWatcherService {
  private watcher: vscode.FileSystemWatcher | null = null;
  private workspaceRoot: string = '';
  private options: FileWatcherOptions;
  private changeCallbacks: FileChangeCallback[] = [];
  private eventQueue: FileChangeEvent[] = [];
  private debounceTimer: NodeJS.Timeout | null = null;
  private isDisposed = false;
  private processedPaths: Set<string> = new Set();

  constructor(options?: Partial<FileWatcherOptions>) {
    this.options = {
      ignorePatterns: options?.ignorePatterns ?? [
        '**/node_modules/**',
        '**/.git/**',
        '**/dist/**',
        '**/build/**',
        '**/*.log',
        '**/.DS_Store',
      ],
      debounceMs: options?.debounceMs ?? 300,
      maxQueueSize: options?.maxQueueSize ?? 100,
    };
  }

  start(workspaceRoot: string): void {
    this.workspaceRoot = workspaceRoot;
    this.isDisposed = false;

    const globPattern = new vscode.RelativePattern(
      workspaceRoot,
      '**/*'
    );

    this.watcher = vscode.workspace.createFileSystemWatcher(
      globPattern,
      false,
      true,
      false
    );

    this.watcher.onDidCreate((uri) => {
      this.handleEvent('created', uri.fsPath);
    });

    this.watcher.onDidChange((uri) => {
      this.handleEvent('changed', uri.fsPath);
    });

    this.watcher.onDidDelete((uri) => {
      this.handleEvent('deleted', uri.fsPath);
    });

    console.log('FileWatcher: Started watching', workspaceRoot);
  }

  private handleEvent(type: FileChangeEvent['type'], filePath: string): void {
    if (this.isDisposed) return;
    if (this.shouldIgnore(filePath)) return;

    const event: FileChangeEvent = {
      type,
      path: filePath,
      timestamp: Date.now(),
    };

    const key = `${type}:${filePath}`;
    if (this.processedPaths.has(key)) {
      return;
    }
    this.processedPaths.add(key);

    this.eventQueue.push(event);

    if (this.eventQueue.length > this.options.maxQueueSize) {
      this.eventQueue = this.eventQueue.slice(-this.options.maxQueueSize);
    }

    this.scheduleFlush();
  }

  private scheduleFlush(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      this.flushEvents();
    }, this.options.debounceMs);
  }

  private flushEvents(): void {
    if (this.eventQueue.length === 0) return;

    const events = [...this.eventQueue];
    this.eventQueue = [];

    for (const callback of this.changeCallbacks) {
      try {
        callback(events);
      } catch (error) {
        console.error('FileWatcher callback error:', error);
      }
    }
  }

  private shouldIgnore(filePath: string): boolean {
    const normalized = filePath.replace(/\\/g, '/');
    const fileName = path.basename(normalized);

    for (const pattern of this.options.ignorePatterns) {
      if (this.matchPattern(normalized, fileName, pattern)) {
        return true;
      }
    }

    return false;
  }

  private matchPattern(normalizedPath: string, fileName: string, pattern: string): boolean {
    const normalizedPattern = pattern.replace(/\\/g, '/');

    if (normalizedPattern.includes('**')) {
      const regex = this.globToRegex(normalizedPattern);
      return regex.test(normalizedPath) || regex.test(fileName);
    }

    if (normalizedPattern.endsWith('/')) {
      const dir = normalizedPattern.slice(0, -1);
      return normalizedPath.includes('/' + dir + '/') || normalizedPath.endsWith('/' + dir);
    }

    if (normalizedPattern.includes('*')) {
      const regex = this.globToRegex(normalizedPattern);
      return regex.test(normalizedPath) || regex.test(fileName);
    }

    return normalizedPath.includes(normalizedPattern) || fileName === normalizedPattern;
  }

  private globToRegex(glob: string): RegExp {
    let regexStr = glob
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*\*/g, '.*')
      .replace(/\*/g, '[^/]*')
      .replace(/\?/g, '[^/]');
    
    return new RegExp('^' + regexStr + '$');
  }

  onDidChange(callback: FileChangeCallback): vscode.Disposable {
    this.changeCallbacks.push(callback);

    return {
      dispose: () => {
        const index = this.changeCallbacks.indexOf(callback);
        if (index >= 0) {
          this.changeCallbacks.splice(index, 1);
        }
      }
    };
  }

  stop(): void {
    if (this.watcher) {
      this.watcher.dispose();
      this.watcher = null;
    }

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    this.processedPaths.clear();
    console.log('FileWatcher: Stopped watching');
  }

  dispose(): void {
    this.isDisposed = true;
    this.stop();
    this.changeCallbacks = [];
    this.eventQueue = [];
  }
}

export class SmartCache {
  private cache: Map<string, { value: any; timestamp: number; ttl: number }> = new Map();
  private defaultTtl: number;

  constructor(defaultTtlMs: number = 60000) {
    this.defaultTtl = defaultTtlMs;
  }

  set<T>(key: string, value: T, ttl?: number): void {
    this.cache.set(key, {
      value,
      timestamp: Date.now(),
      ttl: ttl ?? this.defaultTtl,
    });
  }

  get<T>(key: string): T | undefined {
    const entry = this.cache.get(key);
    
    if (!entry) return undefined;
    
    const age = Date.now() - entry.timestamp;
    if (age > entry.ttl) {
      this.cache.delete(key);
      return undefined;
    }
    
    return entry.value as T;
  }

  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    
    const age = Date.now() - entry.timestamp;
    if (age > entry.ttl) {
      this.cache.delete(key);
      return false;
    }
    
    return true;
  }

  delete(key: string): void {
    this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  invalidate(pattern: string): void {
    const regex = this.globToRegex(pattern);
    
    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        this.cache.delete(key);
      }
    }
  }

  private globToRegex(glob: string): RegExp {
    const escaped = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    const regexStr = escaped.replace(/\*/g, '.*');
    return new RegExp('^' + regexStr + '$');
  }

  size(): number {
    return this.cache.size;
  }

  cleanup(): number {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(key);
        cleaned++;
      }
    }
    
    return cleaned;
  }
}

export class FileChangeAggregator {
  private events: FileChangeEvent[] = [];
  private flushCallbacks: ((events: FileChangeEvent[]) => void)[] = [];
  private timer: NodeJS.Timeout | null = null;

  constructor(private flushIntervalMs: number = 1000) {}

  add(event: FileChangeEvent): void {
    this.events.push(event);
    this.scheduleFlush();
  }

  private scheduleFlush(): void {
    if (this.timer) return;
    
    this.timer = setTimeout(() => {
      this.flush();
    }, this.flushIntervalMs);
  }

  private flush(): void {
    this.timer = null;
    
    if (this.events.length === 0) return;
    
    const events = [...this.events];
    this.events = [];
    
    const byPath = new Map<string, FileChangeEvent>();
    
    for (const event of events) {
      const existing = byPath.get(event.path);
      if (!existing || this.priority(event) > this.priority(existing)) {
        byPath.set(event.path, event);
      }
    }
    
    const deduped = Array.from(byPath.values());
    
    for (const callback of this.flushCallbacks) {
      callback(deduped);
    }
  }

  private priority(event: FileChangeEvent): number {
    switch (event.type) {
      case 'deleted': return 3;
      case 'created': return 2;
      case 'changed': return 1;
      case 'renamed': return 0;
      default: return 0;
    }
  }

  onFlush(callback: (events: FileChangeEvent[]) => void): void {
    this.flushCallbacks.push(callback);
  }

  dispose(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.flushCallbacks = [];
    this.events = [];
  }
}
