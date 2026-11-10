/** Full and incremental indexing of a repository's history. */
import fs from 'node:fs';
import path from 'node:path';
import { git, gitDir, headSha, logMeta, logNumstat, isShallow, lsFiles } from './git.js';
import { openIndex, setMeta, getMeta, tx, dbStats } from './db.js';
import { extractRationale, isBot, isTrivial, cleanSubject, hasFixWord } from './signals.js';

export function indexPathFor(gitDirPath) {
  return path.join(gitDirPath, 'whygit', 'index.db');
}

export function indexExists(gitDirPath) {
  return fs.existsSync(indexPathFor(gitDirPath));
}

function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

/**
 * Build or refresh the index.
 * opts: { cwd, full, quiet, onProgress(step, done, total) }
 */
export function buildIndex(opts) {
  const o = opts || {};
  const cwd = o.cwd || process.cwd();
  const t0 = Date.now();
  const gd = gitDir(cwd);
  const head = headSha(cwd);
  if (!head) throw new Error('repository has no commits yet');
  const dbc = openIndex(gd, { create: true });
  const prevHead = getMeta(dbc, 'head');
  let since = null;
  if (!o.full && prevHead && prevHead !== head) {
    const ok = git(['rev-parse', '--verify', '--quiet', prevHead + '^{commit}'], { cwd: cwd, maxBuffer: 1e7 });
    if (ok) since = prevHead;
  }

  const metas = logMeta(cwd, { since: since });
  const stats = logNumstat(cwd, { since: since });

  const insertCommit = dbc.prepare(
    'INSERT OR REPLACE INTO commits (sha, ts, iso, author, email, subject, body, parents, is_bot, files_changed, added, removed, paths) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)'
  );
  const insertFile = dbc.prepare('INSERT OR REPLACE INTO commit_files (sha, path, added, removed, status) VALUES (?,?,?,?,?)');
  const insertDecision = dbc.prepare('INSERT OR REPLACE INTO decisions (sha, ts, title, rationale, paths, kind, confidence, evidence) VALUES (?,?,?,?,?,?,?,?)');
  const deleteFts = dbc.prepare('DELETE FROM decisions_fts WHERE rowid = (SELECT rowid FROM decisions WHERE sha = ?)');
  const insertFts = dbc.prepare('INSERT INTO decisions_fts (rowid, title, rationale, paths, subject) VALUES (?,?,?,?,?)');
  const deleteTri = dbc.prepare('DELETE FROM decisions_tri WHERE rowid = (SELECT rowid FROM decisions WHERE sha = ?)');
  const insertTri = dbc.prepare('INSERT INTO decisions_tri (rowid, title, rationale, paths) VALUES (?,?,?,?)');
  const getRowid = dbc.prepare('SELECT rowid AS rid FROM decisions WHERE sha = ?');

  let decisions = 0;
  const batches = chunk(metas, 400);
  for (let bi = 0; bi < batches.length; bi++) {
    const batch = batches[bi];
    tx(dbc, function () {
      for (const com of batch) {
        const files = stats.get(com.sha) || [];
        const paths = files.map(function (f) { return f.path; });
        const added = files.reduce(function (a, f) { return a + f.added; }, 0);
        const removed = files.reduce(function (a, f) { return a + f.removed; }, 0);
        const bot = isBot(com.author, com.email) ? 1 : 0;
        insertCommit.run(com.sha, com.ts, com.iso, com.author, com.email, com.subject, com.body, com.parents.join(' '), bot, files.length, added, removed, paths.slice(0, 40).join(' '));
        for (const f of files) {
          const status = f.added > 0 && f.removed > 0 ? 'M' : f.added > 0 ? 'A' : 'D';
          insertFile.run(com.sha, f.path, f.added, f.removed, status);
        }
        const rat = extractRationale(com.subject, com.body);
        const title = cleanSubject(com.subject);
        const kind = hasFixWord(title) || hasFixWord(com.body.slice(0, 400)) ? 'fix' : isTrivial(title) ? 'chore' : 'change';
        let confidence = rat.confidence;
        if (bot) confidence = Math.min(confidence, 0.2);
        if (isTrivial(title)) confidence = Math.min(confidence, 0.25);
        if (files.length > 60) confidence = Math.min(confidence, 0.5);
        deleteFts.run(com.sha);
        deleteTri.run(com.sha);
        insertDecision.run(com.sha, com.ts, title, rat.rationale, paths.slice(0, 24).join(' '), kind, confidence, rat.source);
        const rid = getRowid.get(com.sha);
        if (rid) {
          insertFts.run(rid.rid, title, rat.rationale, paths.slice(0, 24).join(' '), title);
          insertTri.run(rid.rid, title, rat.rationale, paths.slice(0, 24).join(' '));
        }
        decisions += 1;
      }
    });
    if (o.onProgress) o.onProgress('index', Math.min((bi + 1) * 400, metas.length), metas.length);
  }

  setMeta(dbc, 'head', head);
  setMeta(dbc, 'indexed_at', String(Date.now()));
  setMeta(dbc, 'commits_total', String(Number(getMeta(dbc, 'commits_total') || 0) + metas.length));
  setMeta(dbc, 'shallow', isShallow(cwd) ? '1' : '0');
  setMeta(dbc, 'root', String(cwd));
  const elapsed = Date.now() - t0;
  setMeta(dbc, 'last_seconds', String(elapsed));
  const st = dbStats(dbc);
  dbc.close();
  return { commits: metas.length, decisions: decisions, elapsed: elapsed, since: since, files: st.files, total: st.commits };
}

/** Compute per-file risk metrics from commit_files. */
export function computeRisk(dbc, opts) {
  const o = opts || {};
  const rows = dbc.prepare(
    'SELECT cf.path AS path, COUNT(*) AS commits, COUNT(DISTINCT c.email) AS authors, SUM(cf.added) AS added, SUM(cf.removed) AS removed, MAX(c.ts) AS last_ts, SUM(CASE WHEN c.is_bot = 0 AND (LOWER(c.subject) LIKE \'%fix%\' OR LOWER(c.subject) LIKE \'%revert%\' OR LOWER(c.subject) LIKE \'%bug%\' OR LOWER(c.subject) LIKE \'%hotfix%\' OR LOWER(c.subject) LIKE \'%patch%\') THEN 1 ELSE 0 END) AS fixes FROM commit_files cf JOIN commits c ON c.sha = cf.sha GROUP BY cf.path'
  ).all();
  const del = dbc.prepare('DELETE FROM risk');
  const ins = dbc.prepare('INSERT INTO risk (path, score, commits, authors, fixes, todos, last_ts, added, removed) VALUES (?,?,?,?,?,?,?,?,?)');
  const now = Date.now() / 1000;
  tx(dbc, function () {
    del.run();
    for (const r of rows) {
      const churn = (r.added || 0) + (r.removed || 0);
      const fixRatio = r.commits ? r.fixes / r.commits : 0;
      const ageDays = Math.max(0, (now - (r.last_ts || now)) / 86400);
      const freshness = 1 / (1 + ageDays / 180);
      let score =
        Math.log10(1 + churn) * (1 + fixRatio * 1.5) * (1 + Math.min(r.authors, 8) / 6) * (0.6 + 0.4 * freshness);
      if (/(^|\/)(tests?|__tests__|specs?|fixtures?)\//.test(r.path)) score *= 0.55;
      if (/\.(rst|md|mdx|txt)$/.test(r.path)) score *= 0.5;
      if (/(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|poetry\.lock|go\.sum|Cargo\.lock)$/.test(r.path)) score *= 0.2;
      ins.run(r.path, score, r.commits, r.authors, r.fixes, 0, r.last_ts, r.added, r.removed);
    }
  });
  return rows.length;
}

/** Count TODO/FIXME-ish markers in the working tree, one pass, cheap. */
export function scanMarkers(dbc, cwd) {
  const files = lsFiles(cwd).filter(function (p) {
    return /\.(js|jsx|mjs|cjs|ts|tsx|py|rb|go|rs|java|kt|c|h|cc|cpp|hpp|cs|php|swift|sh|ps1|lua|ex|exs|vue|svelte|sql|md|css|scss)$/i.test(p);
  });
  const upd = dbc.prepare('UPDATE risk SET todos = ? WHERE path = ?');
  const RE = /\b(TODO|FIXME|HACK|XXX|BUG)\b/g;
  let total = 0;
  tx(dbc, function () {
    for (const f of files) {
      let text = '';
      try { text = fs.readFileSync(path.join(cwd, f), 'utf8'); } catch { continue; }
      if (text.length > 400000) continue;
      const m = text.match(RE);
      const n = m ? m.length : 0;
      if (n) { upd.run(n, f); total += n; }
    }
  });
  return { files: files.length, markers: total };
}
