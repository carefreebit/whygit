/** Shared command context: locate repo, open index, auto-build when missing. */
import process from 'node:process';
import { isRepo, repoRoot, gitDir, headSha, branchName, remoteWebUrl } from './git.js';
import { openIndex, dbStats, getMeta } from './db.js';
import { buildIndex, computeRisk } from './indexer.js';
import { c, warn, die } from './util.js';

export function resolveRepo(cwd) {
  const start = cwd || process.cwd();
  if (!isRepo(start)) die('not inside a git repository (run this from your project, or pass --cwd)');
  return repoRoot(start);
}

export function loadContext(opts) {
  const o = opts || {};
  const cwd = resolveRepo(o.cwd);
  const gd = gitDir(cwd);
  let db = openIndex(gd, { create: false });
  if (!db) {
    if (o.noAuto) die('no index yet - run ' + c.bold('whygit init'));
    process.stderr.write(c.dim('whygit: building index (first run, one pass over history)...\n'));
    const res = buildIndex({ cwd: cwd, quiet: true });
    process.stderr.write(c.dim('whygit: indexed ' + res.commits + ' commits in ' + (res.elapsed / 1000).toFixed(2) + 's\n'));
    db = openIndex(gd, { create: false });
  }
  const head = headSha(cwd);
  const indexedHead = getMeta(db, 'head');
  const empty = dbStats(db).commits === 0;
  if ((empty || (head && indexedHead && head !== indexedHead)) && o.refresh !== false) {
    try {
      buildIndex({ cwd: cwd, quiet: true });
      db.close();
      db = openIndex(gd, { create: false });
    } catch (err) {
      warn('could not refresh index: ' + err.message);
    }
  }
  return {
    cwd: cwd,
    gitDir: gd,
    db: db,
    head: head,
    branch: branchName(cwd),
    webUrl: remoteWebUrl(cwd),
    stats: dbStats(db),
    root: getMeta(db, 'root') || cwd,
  };
}

export function repoLabel(ctx) {
  const web = ctx.webUrl;
  if (web) {
    const m = web.match(/^https?:\/\/[^/]+\/(.+)$/);
    if (m) return m[1];
  }
  return ctx.cwd.split(/[\\/]/).pop();
}

export function ensureIndex(cwd, full) {
  return buildIndex({ cwd: cwd, full: full });
}

export { computeRisk };
