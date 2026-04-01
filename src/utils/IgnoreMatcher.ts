import * as fs from 'fs/promises';
import * as path from 'path';

interface IgnoreRule {
  negated: boolean;
  basenameOnly: boolean;
  directoryOnly: boolean;
  anchored: boolean;
  regex: RegExp;
}

function normalizeRelativePath(relativePath: string): string {
  return relativePath
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(/^\//, '')
    .replace(/\/+/g, '/')
    .replace(/\/$/, '');
}

function toRegexFragment(pattern: string): string {
  return pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '<<DOUBLE_STAR>>')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '[^/]')
    .replace(/<<DOUBLE_STAR>>/g, '.*');
}

function getPathSuffixes(normalizedPath: string): string[] {
  const segments = normalizedPath.split('/');
  return segments.map((_, index) => segments.slice(index).join('/'));
}

export class IgnoreMatcher {
  private rules: IgnoreRule[] = [];

  constructor(private readonly rootPath: string) {}

  static empty(): IgnoreMatcher {
    return new IgnoreMatcher('');
  }

  static async create(rootPath: string, additionalPatterns: string[] = []): Promise<IgnoreMatcher> {
    const matcher = new IgnoreMatcher(rootPath);
    await matcher.reload(additionalPatterns);
    return matcher;
  }

  async reload(additionalPatterns: string[] = []): Promise<void> {
    const rules: IgnoreRule[] = [];

    rules.push(...this.parsePatterns(additionalPatterns));

    if (this.rootPath) {
      try {
        const gitignorePath = path.join(this.rootPath, '.gitignore');
        const content = await fs.readFile(gitignorePath, 'utf-8');
        rules.push(...this.parsePatterns(content.split(/\r?\n/)));
      } catch {
        // Ignore missing .gitignore files.
      }
    }

    this.rules = rules;
  }

  ignores(relativePath: string, isDirectory: boolean): boolean {
    const normalizedPath = normalizeRelativePath(relativePath);
    if (!normalizedPath || normalizedPath === '.') {
      return false;
    }

    let ignored = false;

    for (const rule of this.rules) {
      if (this.matchesRule(rule, normalizedPath, isDirectory)) {
        ignored = !rule.negated;
      }
    }

    return ignored;
  }

  private parsePatterns(patterns: string[]): IgnoreRule[] {
    return patterns
      .map((pattern) => this.parsePattern(pattern))
      .filter((rule): rule is IgnoreRule => rule !== null);
  }

  private parsePattern(pattern: string): IgnoreRule | null {
    let working = pattern.trim();
    if (!working || working.startsWith('#')) {
      return null;
    }

    const negated = working.startsWith('!');
    if (negated) {
      working = working.slice(1).trim();
    }

    if (!working) {
      return null;
    }

    while (working.startsWith('**/')) {
      working = working.slice(3);
    }

    let directoryOnly = false;
    if (working.endsWith('/**')) {
      working = working.slice(0, -3);
      directoryOnly = true;
    }
    if (working.endsWith('/')) {
      working = working.replace(/\/+$/, '');
      directoryOnly = true;
    }

    const anchored = working.startsWith('/');
    if (anchored) {
      working = working.slice(1);
    }

    working = normalizeRelativePath(working);
    if (!working) {
      return null;
    }

    const basenameOnly = !working.includes('/');
    const fragment = toRegexFragment(working);
    const regex = basenameOnly
      ? new RegExp(`^${fragment}$`)
      : new RegExp(directoryOnly ? `^${fragment}(?:/.*)?$` : `^${fragment}$`);

    return {
      negated,
      basenameOnly,
      directoryOnly,
      anchored,
      regex,
    };
  }

  private matchesRule(rule: IgnoreRule, normalizedPath: string, isDirectory: boolean): boolean {
    if (rule.basenameOnly) {
      const segments = normalizedPath.split('/');
      const scopedSegments = rule.anchored ? segments.slice(0, 1) : segments;

      return scopedSegments.some((segment, index) => {
        if (!rule.regex.test(segment)) {
          return false;
        }

        if (index < scopedSegments.length - 1 || normalizedPath.includes(`${segment}/`)) {
          return true;
        }

        return !rule.directoryOnly || isDirectory;
      });
    }

    const candidates = rule.anchored ? [normalizedPath] : getPathSuffixes(normalizedPath);
    return candidates.some((candidate) => rule.regex.test(candidate));
  }
}
