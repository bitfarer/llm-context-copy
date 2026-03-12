import * as path from 'path';

const LANGUAGE_MAP: Record<string, string> = {
  '.js': 'javascript',
  '.ts': 'typescript',
  '.tsx': 'typescriptreact',
  '.jsx': 'javascriptreact',
  '.py': 'python',
  '.java': 'java',
  '.c': 'c',
  '.cpp': 'cpp',
  '.cs': 'csharp',
  '.go': 'go',
  '.rs': 'rust',
  '.php': 'php',
  '.rb': 'ruby',
  '.swift': 'swift',
  '.kt': 'kotlin',
  '.dart': 'dart',
  '.lua': 'lua',
  '.sh': 'shell',
  '.bash': 'shell',
  '.zsh': 'shell',
  '.sql': 'sql',
  '.json': 'json',
  '.xml': 'xml',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.toml': 'toml',
  '.md': 'markdown',
  '.html': 'html',
  '.css': 'css',
  '.scss': 'scss',
  '.sass': 'sass',
  '.less': 'less',
  '.svg': 'svg',
};

export function detectLanguage(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return LANGUAGE_MAP[ext] || 'plaintext';
}

export function normalizeFilePath(filePath: string, rootPath: string): string {
  return path.relative(rootPath, filePath).replace(/\\/g, '/');
}

export function joinPath(root: string, ...segments: string[]): string {
  return path.join(root, ...segments);
}

export function getExtension(filePath: string): string {
  return path.extname(filePath).toLowerCase();
}

export function getBaseName(filePath: string): string {
  return path.basename(filePath);
}

export function getDirName(filePath: string): string {
  return path.dirname(filePath);
}
