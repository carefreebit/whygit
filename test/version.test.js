import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const run = (...args) =>
  execFileSync(process.execPath, [join(root, 'bin', 'whygit.js'), ...args], { encoding: 'utf8' }).trim();

test('--version reports the packaged version', () => {
  assert.equal(run('--version'), pkg.version);
});

test('version subcommand reports the packaged version', () => {
  assert.equal(run('version'), pkg.version);
});

test('help exits cleanly', () => {
  const out = run('help');
  assert.match(out, /whygit/);
  assert.match(out, /why/);
});
