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

const BINARY_EXTENSIONS: Set<string> = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.bmp', '.tiff', '.tif',
  '.woff', '.woff2', '.ttf', '.eot', '.otf',
  '.zip', '.tar', '.gz', '.rar', '.7z', '.bz2',
  '.exe', '.dll', '.so', '.dylib', '.class', '.jar', '.war',
  '.db', '.sqlite', '.sqlite3',
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.mp3', '.mp4', '.wav', '.avi', '.mov', '.mkv', '.flv',
  '.iso', '.dmg', '.pkg',
  '.node', '.wasm',
]);

const BINARY_CATEGORY_MAP: Record<string, string> = {
  '.png': 'Image', '.jpg': 'Image', '.jpeg': 'Image', '.gif': 'Image',
  '.webp': 'Image', '.ico': 'Image', '.bmp': 'Image', '.tiff': 'Image', '.tif': 'Image',
  '.woff': 'Font', '.woff2': 'Font', '.ttf': 'Font', '.eot': 'Font', '.otf': 'Font',
  '.zip': 'Archive', '.tar': 'Archive', '.gz': 'Archive', '.rar': 'Archive',
  '.7z': 'Archive', '.bz2': 'Archive',
  '.exe': 'Executable', '.dll': 'Executable', '.so': 'Executable',
  '.dylib': 'Executable', '.class': 'Executable', '.jar': 'Executable', '.war': 'Executable',
  '.db': 'Database', '.sqlite': 'Database', '.sqlite3': 'Database',
  '.pdf': 'Document', '.doc': 'Document', '.docx': 'Document',
  '.xls': 'Document', '.xlsx': 'Document', '.ppt': 'Document', '.pptx': 'Document',
  '.mp3': 'Media', '.mp4': 'Media', '.wav': 'Media', '.avi': 'Media',
  '.mov': 'Media', '.mkv': 'Media', '.flv': 'Media',
  '.iso': 'Disk Image', '.dmg': 'Disk Image', '.pkg': 'Disk Image',
  '.node': 'Binary', '.wasm': 'Binary',
};

export function isBinaryFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return BINARY_EXTENSIONS.has(ext);
}

export function getBinaryFileCategory(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return BINARY_CATEGORY_MAP[ext] || 'Binary';
}

export function isTextFile(filePath: string): boolean {
  return !isBinaryFile(filePath);
}

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
