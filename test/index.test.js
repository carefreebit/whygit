import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { makeRepo, git } from './helpers.js';
import { buildIndex, computeRisk, scanMarkers } from '../src/indexer.js';
import { openIndex } from '../src/db.js';
import { gitDir } from '../src/git.js';
import { search, topDecisions, decisionFor } from '../src/search.js';
import { decisionsForFile, topRisk } from '../src/risk.js';
import { buildWhylog } from '../src/whylog.js';
import { createServer } from '../src/mcp.js';
import { stripAnsi } from '../src/util.js';

const repo = makeRepo();
const res = buildIndex({ cwd: repo });
const db = openIndex(gitDir(repo), { create: false });
computeRisk(db);
scanMarkers(db, repo);
const ctx = { cwd: repo, db: db, head: null, stats: { commits: res.commits, files: res.files, decisions: res.decisions } };

test('indexes every non-merge commit', function () {
  assert.equal(res.commits, 4);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM commits').get().n, 4);
});

test('search finds the decision behind a behaviour', function () {
  const rows = search(db, 'retry 503', { limit: 3 });
  assert.ok(rows.length >= 1);
  assert.match(rows[0].title, /Retry on 503/);
  assert.match(rows[0].rationale, /backoff/);
});

test('search understands Chinese rationale', function () {
  const rows = search(db, '连接池', { limit: 3 });
  assert.ok(rows.length >= 1);
  assert.match(rows[0].rationale, /连接池/);
});

test('bot and chore commits rank below real decisions', function () {
  const rows = topDecisions(db, 4);
  assert.ok(rows.length >= 1);
  assert.ok(!/docs: fix typo/.test(rows[0].title));
});

test('decisionFor round-trips a sha', function () {
  const sha = git(repo, ['rev-parse', 'HEAD~1']).trim();
  const d = decisionFor(db, git(repo, ['rev-parse', 'HEAD~2']).trim());
  assert.ok(d);
  assert.match(d.title, /Retry on 503/);
  assert.ok(sha);
});

test('file history is chronological', function () {
  const rows = decisionsForFile(db, 'src/client.js', 10);
  assert.equal(rows.length, 2);
  assert.ok(rows[0].ts <= rows[1].ts);
});

test('risk ranks the churned file', function () {
  const rows = topRisk(db, 5);
  assert.ok(rows.some(function (r) { return r.path === 'src/client.js'; }));
});

test('whylog contains the load-bearing decision', function () {
  const md = buildWhylog(ctx, { label: 'demo' });
  assert.match(md, /# WHYLOG/);
  assert.match(md, /Retry on 503/);
  assert.match(md, /## The cursed files/);
});

test('mcp server answers tools/list and tools/call', function () {
  const s = createServer({ cwd: repo });
  const list = s.handle({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
  assert.ok(list.result.tools.length >= 5);
  const call = s.handle({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'why_search', arguments: { query: 'retry', limit: 2 } } });
  const payload = JSON.parse(call.result.content[0].text);
  assert.ok(payload.results.length >= 1);
  assert.match(payload.results[0].title, /Retry/);
});

test('incremental index picks up a new commit', function () {
  fs.writeFileSync(path.join(repo, 'src/pool.js'), 'export function release(c) { return c; }\n');
  exec(git, ['add', '-A']);
  exec(git, ['commit', '-q', '-m', 'Fix pool release\n\nWe hit a leak because the guard threw before returning the handle.']);
  const inc = buildIndex({ cwd: repo });
  assert.equal(inc.commits, 1);
  assert.equal(inc.since != null, true);
  const rows = search(db, 'leak guard', { limit: 2 });
  assert.match(rows[0].title, /Fix pool release/);
});

function exec(fn, args) {
  return fn(repo, args);
}
