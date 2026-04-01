import * as assert from 'assert';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { IgnoreMatcher } from '../../utils/IgnoreMatcher';

suite('IgnoreMatcher Tests', () => {
  test('should apply gitignore directory and wildcard rules', async () => {
    const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'ignore-matcher-'));

    try {
      await fs.writeFile(
        path.join(workspace, '.gitignore'),
        ['dist/', '*.log', '!dist/keep.log'].join('\n'),
        'utf-8'
      );

      const matcher = await IgnoreMatcher.create(workspace);

      assert.strictEqual(matcher.ignores('dist', true), true);
      assert.strictEqual(matcher.ignores('dist/app.js', false), true);
      assert.strictEqual(matcher.ignores('logs/error.log', false), true);
      assert.strictEqual(matcher.ignores('dist/keep.log', false), false);
      assert.strictEqual(matcher.ignores('src/app.ts', false), false);
    } finally {
      await fs.rm(workspace, { recursive: true, force: true });
    }
  });

  test('should apply additional exclude patterns', async () => {
    const matcher = await IgnoreMatcher.create('', ['**/node_modules/**', '**/*.min.js']);

    assert.strictEqual(matcher.ignores('node_modules/pkg/index.js', false), true);
    assert.strictEqual(matcher.ignores('src/app.min.js', false), true);
    assert.strictEqual(matcher.ignores('src/app.ts', false), false);
  });

  test('should respect anchored root-only rules', async () => {
    const matcher = await IgnoreMatcher.create('', ['/dist/', '/package-lock.json']);

    assert.strictEqual(matcher.ignores('dist', true), true);
    assert.strictEqual(matcher.ignores('dist/app.js', false), true);
    assert.strictEqual(matcher.ignores('packages/dist/app.js', false), false);
    assert.strictEqual(matcher.ignores('package-lock.json', false), true);
    assert.strictEqual(matcher.ignores('packages/package-lock.json', false), false);
  });
});
