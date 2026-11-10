import test from 'node:test';
import assert from 'node:assert/strict';
import { extractRationale, stripNoise, isBot, dedupeSubject, scoreSentence, mineComments } from '../src/signals.js';

test('extracts a causal sentence and ignores sign-off lines', function () {
  const r = extractRationale('Retry on 503', 'Servers return 503 during deploys, so we retry twice.\n\nSigned-off-by: A <a@b.c>');
  assert.equal(r.source, 'body');
  assert.ok(r.rationale.includes('retry twice'));
  assert.ok(!r.rationale.includes('Signed-off'));
  assert.ok(r.confidence >= 0.6);
});

test('dedupes a squash-merge subject repeated in the body', function () {
  const body = 'Retry on 503\n\nThe proxy returns 503 while it reloads, so we retry.';
  const cleaned = dedupeSubject(body, 'Retry on 503');
  assert.ok(!cleaned.startsWith('Retry on 503'));
});

test('stripNoise removes conflict markers and trailers', function () {
  const body = 'Conflicts: src/a.js\nCo-authored-by: X <x@y.z>\nActual reason.';
  const out = stripNoise(body);
  assert.equal(out, 'Actual reason.');
});

test('detects bots and release chores', function () {
  assert.equal(isBot('dependabot[bot]', 'x@y.z'), true);
  assert.equal(isBot('Jane Dev', 'jane@corp.com'), false);
});

test('supports Chinese rationale markers', function () {
  const r = extractRationale('修复连接泄漏', '由于连接池在异常时不会回收句柄，我们增加了 finally 分支来避免泄漏。');
  assert.ok(r.rationale.includes('由于'));
  assert.ok(r.confidence >= 0.6);
});

test('scores causal sentences above descriptive ones', function () {
  assert.ok(scoreSentence('This avoids a deadlock because the lock is released first.') > scoreSentence('Update the readme.'));
});

test('mines intent comments from added diff lines', function () {
  const files = [{ path: 'a.js', hunks: [{ added: ['// NOTE: keep this above the lock or it deadlocks'] }] }];
  const found = mineComments(files);
  assert.equal(found.length, 1);
  assert.ok(found[0].text.startsWith('keep this above'));
});
