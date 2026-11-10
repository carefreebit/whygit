/** Test fixture: a tiny repo with known, explainable history. */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function git(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8'.slice(0) }).toString();
}

export function makeRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'whygit-test-'));
  git(dir, ['init', '-q', '-b', 'main']);
  git(dir, ['config', 'user.name', 'Test Author']);
  git(dir, ['config', 'user.email', 'test@example.com']);
  git(dir, ['config', 'commit.gpgsign', 'false']);
  const w = function (p, text) {
    fs.mkdirSync(path.dirname(path.join(dir, p)), { recursive: true });
    fs.writeFileSync(path.join(dir, p), text);
  };
  const commit = function (msg, files, date) {
    for (const f of Object.keys(files)) w(f, files[f]);
    git(dir, ['add', '-A']);
    const env = Object.assign({}, process.env, {
      GIT_AUTHOR_DATE: date + 'T10:00:00Z',
      GIT_COMMITTER_DATE: date + 'T10:00:00Z',
    });
    execFileSync('git', ['commit', '-q', '-m', msg], { cwd: dir, env: env });
  };
  commit('Create the client', { 'src/client.js': 'export function get() { return 1; }\n' }, '2021-01-05');
  commit(
    'Retry on 503\n\nServers behind a load balancer return 503 during deploys, so we retry twice with backoff.\n\nSigned-off-by: Test Author <test@example.com>',
    { 'src/client.js': 'export function get() { return 1; }\nexport function retry(n) { return n; }\n' },
    '2022-03-01'
  );
  commit('docs: fix typo', { 'README.md': '# demo\n' }, '2022-04-01');
  commit(
    'Fix race in pool\n\n由于连接池在关闭时仍可能返回连接，我们在归还前检查状态。',
    { 'src/pool.js': 'export function release(c) { if (!c) throw new Error("closed"); }\n' },
    '2023-06-15'
  );
  return dir;
}
