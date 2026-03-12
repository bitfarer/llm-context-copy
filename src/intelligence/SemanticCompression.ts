import { FileContext } from '../types';

export interface SemanticCompressionOptions {
  preserveTypes: boolean;
  preserveSignatures: boolean;
  collapseFunctionBodies: boolean;
  preserveExports: boolean;
  maxBodyLines: number;
}

interface ParsedElement {
  type: 'function' | 'class' | 'interface' | 'type' | 'export' | 'import' | 'comment';
  name?: string;
  signature?: string;
  body?: string;
  startLine: number;
  endLine: number;
}

export class SemanticCompressionEngine {
  private options: SemanticCompressionOptions;

  constructor(options?: Partial<SemanticCompressionOptions>) {
    this.options = {
      preserveTypes: options?.preserveTypes ?? true,
      preserveSignatures: options?.preserveSignatures ?? true,
      collapseFunctionBodies: options?.collapseFunctionBodies ?? true,
      preserveExports: options?.preserveExports ?? true,
      maxBodyLines: options?.maxBodyLines ?? 5,
    };
  }

  compress(content: string, language: string): string {
    switch (language) {
      case 'typescript':
      case 'typescriptreact':
        return this.compressTypeScript(content);
      case 'javascript':
      case 'javascriptreact':
        return this.compressJavaScript(content);
      case 'python':
        return this.compressPython(content);
      default:
        return this.compressGeneric(content);
    }
  }

  private compressTypeScript(content: string): string {
    const lines = content.split('\n');
    const result: string[] = [];
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];
      const trimmed = line.trim();

      if (this.isImportStatement(trimmed)) {
        result.push(line);
        i++;
        continue;
      }

      if (this.isInterfaceDeclaration(trimmed)) {
        const interfaceLines = this.extractInterfaceBlock(lines, i);
        if (this.options.preserveTypes) {
          result.push(...interfaceLines.lines);
        }
        i = interfaceLines.endLine;
        continue;
      }

      if (this.isTypeDeclaration(trimmed)) {
        const typeLines = this.extractTypeBlock(lines, i);
        if (this.options.preserveTypes) {
          result.push(...typeLines.lines);
        }
        i = typeLines.endLine;
        continue;
      }

      if (this.isFunctionDeclaration(trimmed)) {
        const funcLines = this.extractFunctionBlock(lines, i);
        if (this.options.preserveSignatures) {
          result.push(funcLines.signature);
          if (this.options.collapseFunctionBodies && funcLines.body.length > this.options.maxBodyLines) {
            result.push(`  // ... ${funcLines.body.length} lines collapsed ...`);
          }
        }
        i = funcLines.endLine;
        continue;
      }

      if (this.isClassDeclaration(trimmed)) {
        const classLines = this.extractClassBlock(lines, i);
        result.push(classLines.signature);
        if (this.options.collapseFunctionBodies) {
          result.push(`  // ... ${classLines.methodCount} methods collapsed ...`);
        }
        i = classLines.endLine;
        continue;
      }

      if (this.isExportDeclaration(trimmed) && this.options.preserveExports) {
        result.push(line);
        i++;
        continue;
      }

      if (trimmed.startsWith('//') || trimmed.startsWith('/*')) {
        if (trimmed.includes('@') || trimmed.includes('TODO') || trimmed.includes('FIXME')) {
          result.push(line);
        }
        i++;
        continue;
      }

      if (trimmed === '' || trimmed === '}') {
        result.push(line);
        i++;
        continue;
      }

      if (this.shouldPreserveLine(trimmed)) {
        result.push(line);
      }

      i++;
    }

    return result.join('\n');
  }

  private compressJavaScript(content: string): string {
    const lines = content.split('\n');
    const result: string[] = [];
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];
      const trimmed = line.trim();

      if (this.isImportStatement(trimmed) || this.isExportDeclaration(trimmed)) {
        result.push(line);
        i++;
        continue;
      }

      if (this.isFunctionDeclaration(trimmed)) {
        const funcLines = this.extractFunctionBlock(lines, i);
        result.push(funcLines.signature);
        if (this.options.collapseFunctionBodies && funcLines.body.length > this.options.maxBodyLines) {
          result.push(`  // ... ${funcLines.body.length} lines collapsed ...`);
        }
        i = funcLines.endLine;
        continue;
      }

      if (trimmed.startsWith('//') || trimmed.startsWith('/*')) {
        if (trimmed.includes('@') || trimmed.includes('TODO') || trimmed.includes('FIXME')) {
          result.push(line);
        }
        i++;
        continue;
      }

      if (trimmed === '' || trimmed === '}') {
        result.push(line);
        i++;
        continue;
      }

      if (this.shouldPreserveLine(trimmed)) {
        result.push(line);
      }

      i++;
    }

    return result.join('\n');
  }

  private compressPython(content: string): string {
    const lines = content.split('\n');
    const result: string[] = [];
    let i = 0;
    let inFunction = false;
    let inClass = false;
    let indentLevel = 0;

    while (i < lines.length) {
      const line = lines[i];
      const trimmed = line.trim();

      if (trimmed.startsWith('def ') || trimmed.startsWith('async def ')) {
        const funcMatch = trimmed.match(/^(async\s+)?def\s+(\w+)\s*\([^)]*\)\s*(->\s*\w+)?:/);
        if (funcMatch) {
          result.push(line);
          inFunction = true;
          indentLevel = line.match(/^\s*/)?.[0].length || 0;
        }
        i++;
        continue;
      }

      if (trimmed.startsWith('class ')) {
        result.push(line);
        inClass = true;
        indentLevel = line.match(/^\s*/)?.[0].length || 0;
        i++;
        continue;
      }

      if ((inFunction || inClass) && line.trim() !== '') {
        const currentIndent = line.match(/^\s*/)?.[0].length || 0;
        if (currentIndent <= indentLevel) {
          inFunction = false;
          inClass = false;
        } else if (this.options.collapseFunctionBodies && inFunction) {
          i++;
          continue;
        }
      }

      if (trimmed.startsWith('#') && (trimmed.includes('TODO') || trimmed.includes('FIXME') || trimmed.includes('@'))) {
        result.push(line);
      } else if (!inFunction && !inClass) {
        result.push(line);
      } else if (trimmed === '') {
        result.push(line);
      }

      if (trimmed !== '' && !line.trim().startsWith('#')) {
        const currentIndent = line.match(/^\s*/)?.[0].length || 0;
        if (currentIndent <= indentLevel) {
          inFunction = false;
          inClass = false;
        }
      }

      i++;
    }

    return result.join('\n');
  }

  private compressGeneric(content: string): string {
    return content;
  }

  private isImportStatement(line: string): boolean {
    return line.startsWith('import ') || line.startsWith('require(') || line.startsWith('#include');
  }

  private isExportDeclaration(line: string): boolean {
    return line.startsWith('export ') || line.startsWith('module.exports') || line.startsWith('export default');
  }

  private isInterfaceDeclaration(line: string): boolean {
    return line.startsWith('interface ') || line.startsWith('export interface ');
  }

  private isTypeDeclaration(line: string): boolean {
    return line.startsWith('type ') || line.startsWith('export type ') || line.startsWith('typealias ');
  }

  private isFunctionDeclaration(line: string): boolean {
    return /^(export\s+)?(async\s+)?(function\s+\w+|const\s+\w+\s*=\s*(async\s+)?\(|\w+\s*\([^)]*\)\s*[:{]|\w+\s*:\s*\([^)]*\)\s*=)/.test(line) ||
           line.includes('=>') ||
           line.startsWith('def ') ||
           line.startsWith('async def ');
  }

  private isClassDeclaration(line: string): boolean {
    return line.startsWith('class ') || line.startsWith('export class ');
  }

  private shouldPreserveLine(line: string): boolean {
    const preservePatterns = [
      /^(const|let|var)\s+\w+\s*=/,
      /^return\s+/,
      /^if\s*\(/,
      /^for\s*\(/,
      /^while\s*\(/,
      /^switch\s*\(/,
      /^try\s*\{/,
      /^catch\s*\(/,
      /^\w+:\s*/,
    ];

    return preservePatterns.some(p => p.test(line));
  }

  private extractInterfaceBlock(lines: string[], startLine: number): { lines: string[]; endLine: number } {
    const result: string[] = [];
    let i = startLine;
    let braceCount = 0;
    let foundFirstBrace = false;

    while (i < lines.length) {
      const line = lines[i];
      result.push(line);

      braceCount += (line.match(/\{/g) || []).length;
      braceCount -= (line.match(/\}/g) || []).length;

      if (line.includes('{')) foundFirstBrace = true;
      if (foundFirstBrace && braceCount === 0) {
        break;
      }
      i++;
    }

    return { lines: result, endLine: i + 1 };
  }

  private extractTypeBlock(lines: string[], startLine: number): { lines: string[]; endLine: number } {
    const result: string[] = [];
    let i = startLine;
    let braceCount = 0;

    while (i < lines.length) {
      const line = lines[i];
      result.push(line);

      braceCount += (line.match(/\{/g) || []).length;
      braceCount -= (line.match(/\}/g) || []).length;

      if (line.includes('=') && braceCount === 0) {
        break;
      }
      i++;
    }

    return { lines: result, endLine: i + 1 };
  }

  private extractFunctionBlock(lines: string[], startLine: number): { signature: string; body: string[]; endLine: number } {
    const signatureLines: string[] = [];
    const bodyLines: string[] = [];
    let i = startLine;
    let braceCount = 0;
    let inBody = false;
    const indentLevel = lines[startLine].match(/^\s*/)?.[0].length || 0;

    while (i < lines.length) {
      const line = lines[i];
      const currentIndent = line.match(/^\s*/)?.[0].length || 0;

      if (!inBody && (line.includes('=') || line.includes('{') || line.includes(':'))) {
        inBody = true;
      }

      if (inBody) {
        braceCount += (line.match(/\{/g) || []).length;
        braceCount -= (line.match(/\}/g) || []).length;
        bodyLines.push(line);

        if (braceCount === 0 && line.includes('}')) {
          break;
        }
      } else {
        signatureLines.push(line);
      }

      if (line.trim() !== '' && !inBody) {
        signatureLines.push(line);
      }

      i++;
    }

    return {
      signature: signatureLines.join('\n'),
      body: bodyLines,
      endLine: i + 1,
    };
  }

  private extractClassBlock(lines: string[], startLine: number): { signature: string; methodCount: number; endLine: number } {
    let i = startLine;
    let braceCount = 0;
    let methodCount = 0;
    const signature = lines[startLine];

    while (i < lines.length) {
      const line = lines[i];
      braceCount += (line.match(/\{/g) || []).length;
      braceCount -= (line.match(/\}/g) || []).length;

      if (line.includes('(') && (line.includes('function') || line.includes('async') || /^\s+\w+\s*\(/.test(line))) {
        methodCount++;
      }

      if (braceCount === 0 && line.includes('}')) {
        break;
      }

      i++;
    }

    return { signature, methodCount, endLine: i + 1 };
  }
}

export function createSemanticCompression(options?: Partial<SemanticCompressionOptions>): (content: string, language: string) => string {
  const engine = new SemanticCompressionEngine(options);
  return (content: string, language: string) => engine.compress(content, language);
}
