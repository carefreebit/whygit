/** Query layer: BM25 + heuristics over the decision index. */
import { openIndex } from './db.js';

const STOP = new Set(['the','a','an','is','are','was','were','to','of','in','on','for','and','or','it','this','that','with','how','why','what','do','does','did','be','by','as','at','from','we','you','i','my','our']);

export function tokenize(q) {
  return String(q || '')
    .toLowerCase()
    .split(/[^a-z0-9_./\u3400-\u9fff-]+/)
    .map(function (t) { return t.replace(/^\.+|\/+$/g, ''); })
    .filter(function (t) { return (t.length > 1 || CJK.test(t)) && !STOP.has(t); })
    .slice(0, 12);
}

export function ftsQuery(q) {
  const toks = tokenize(q);
  if (!toks.length) return null;
  const parts = toks.map(function (t) {
    const safe = t.replace(/"/g, '');
    return '"' + safe + '"*';
  });
  return parts.join(' OR ');
}

const SELECT = 'SELECT d.sha, d.ts, d.title, d.rationale, d.paths, d.kind, d.confidence, c.author, c.is_bot, bm25(decisions_fts, 9.0, 5.0, 6.0, 3.0) AS rank FROM decisions_fts JOIN decisions d ON d.rowid = decisions_fts.rowid JOIN commits c ON c.sha = d.sha';

const CJK = /[\u3400-\u9fff\uf900-\ufaff]/;
const TRI_SELECT = 'SELECT d.sha, d.ts, d.title, d.rationale, d.paths, d.kind, d.confidence, c.author, c.is_bot, bm25(decisions_tri, 9.0, 5.0, 6.0) AS rank FROM decisions_tri JOIN decisions d ON d.rowid = decisions_tri.rowid JOIN commits c ON c.sha = d.sha';

/** Substring search: the trigram index handles CJK and code identifiers. */
export function searchSubstring(dbc, query, opts) {
  const o = opts || {};
  const limit = o.limit || 10;
  const q = String(query || '').trim();
  if (q.length < 3) return searchLike(dbc, q, limit * 6);
  const rows = dbc.prepare(TRI_SELECT + ' WHERE decisions_tri MATCH ? ORDER BY rank LIMIT ?').all('"' + q.replace(/"/g, '') + '"', limit * 6);
  return rows;
}

function searchLike(dbc, q, n) {
  if (!q) return [];
  const like = '%' + q + '%';
  return dbc.prepare('SELECT d.sha, d.ts, d.title, d.rationale, d.paths, d.kind, d.confidence, c.author, c.is_bot, 0 AS rank FROM decisions d JOIN commits c ON c.sha = d.sha WHERE d.title LIKE ? OR d.rationale LIKE ? ORDER BY d.confidence DESC LIMIT ?').all(like, like, n);
}

export function search(dbc, query, opts) {
  const o = opts || {};
  const limit = o.limit || 10;
  const q = String(query || '').trim();
  if (!q) return [];
  const runs = [];
  const match = ftsQuery(query);
  if (match) {
    try {
      runs.push(dbc.prepare(SELECT + ' WHERE decisions_fts MATCH ? ORDER BY rank LIMIT ?').all(match, limit * 6));
    } catch (e) { /* ignore malformed fts syntax */ }
  }
  if (CJK.test(q) || q.length >= 4) {
    try { runs.push(searchSubstring(dbc, q, { limit: limit })); } catch (e) { /* trigram table missing */ }
  }
  const seen = new Map();
  for (const rows of runs) {
    for (const r of rows) {
      const prev = seen.get(r.sha);
      if (!prev || (r.rank || 0) < (prev.rank || 0)) seen.set(r.sha, r);
    }
  }
  const merged = Array.from(seen.values());
  if (!merged.length) return rerank(searchLike(dbc, q, limit * 6), query, o).slice(0, limit);
  return rerank(merged, query, o).slice(0, limit);
}

export function noisePenalty(r) {
  let p = 1;
  const paths = String(r.paths || '').toLowerCase();
  const list = paths.split(' ').filter(Boolean);
  if (list.length && list.every(function (x) { return /(^|\/)(vendor|third_party|thirdparty|packages|node_modules|dist|build|target|external)\//.test(x); })) p *= 0.4;
  if (list.length && list.every(function (x) { return /\.(rst|md|mdx|txt)$/.test(x) || /(^|\/)(docs?|documentation)\//.test(x); })) p *= 0.75;
  const title = String(r.title || '').trim();
  if (/^(bump|update\s+\S+\s+to\s+v?\d|release\s+\d|v?\d+\.\d+\.\d+$)/i.test(title)) p *= 0.45;
  if (/^(revert|revert:)/i.test(title)) p *= 0.7;
  if (/^merge (pull request|branch|remote)/i.test(title)) p *= 0.5;
  return p;
}

export function rerank(rows, query, opts) {
  const o = opts || {};
  const toks = tokenize(query);
  const now = Date.now() / 1000;
  const best = rows.reduce(function (m, r) { return Math.min(m, r.rank || 0); }, 0);
  const scored = rows.map(function (r) {
    const gap = Math.max(0, (r.rank || 0) - best);
    let s = 1 / (1 + gap / 3);
    s *= 0.5 + Math.min(1, r.confidence || 0.2);
    if (r.is_bot) s *= 0.2;
    if (r.kind === 'fix') s *= 1.2;
    if (r.kind === 'chore') s *= 0.7;
    const title = String(r.title || '').toLowerCase();
    const rat = String(r.rationale || '').toLowerCase();
    const paths = String(r.paths || '').toLowerCase();
    let hit = 0;
    for (const t of toks) {
      if (title.includes(t)) { s *= 1.25; hit++; }
      else if (rat.includes(t)) { s *= 1.15; hit++; }
      else if (paths.includes(t)) { s *= 1.08; hit++; }
    }
    const coverage = toks.length ? hit / toks.length : 0;
    s *= 0.35 + 0.9 * coverage;
    if (!r.rationale) s *= 0.75;
    s *= noisePenalty(r);
    const age = Math.max(0, (now - (r.ts || now)) / 86400);
    s *= 0.85 + 0.15 / (1 + age / 900);
    return Object.assign({}, r, { score: s });
  });
  scored.sort(function (a, b) { return b.score - a.score; });
  const seen = new Set();
  const out = [];
  for (const r of scored) {
    if (seen.has(r.sha)) continue;
    seen.add(r.sha);
    out.push(r);
  }
  const top = out.length ? out[0].score : 1;
  for (const r of out) r.match = Math.max(1, Math.round((r.score / (top || 1)) * 100));
  return out;
}

export function decisionFor(dbc, sha) {
  return dbc.prepare('SELECT d.sha, d.ts, d.title, d.rationale, d.paths, d.kind, d.confidence, c.author, c.subject FROM decisions d JOIN commits c ON c.sha = d.sha WHERE d.sha = ?').get(sha) || null;
}

export function decisionsForPath(dbc, p, limit) {
  return dbc.prepare('SELECT d.sha, d.ts, d.title, d.rationale, d.paths, d.kind, d.confidence FROM decisions d JOIN commit_files cf ON cf.sha = d.sha WHERE cf.path = ? ORDER BY d.ts DESC LIMIT ?').all(p, limit || 8);
}

export function recentDecisions(dbc, limit) {
  return dbc.prepare('SELECT d.sha, d.ts, d.title, d.rationale, d.paths, d.kind, d.confidence, c.author FROM decisions d JOIN commits c ON c.sha = d.sha WHERE c.is_bot = 0 AND d.rationale != \'\' ORDER BY d.ts DESC LIMIT ?').all(limit || 10);
}

/** Best-of index: highest-confidence, highest-impact decisions. */
export function topDecisions(dbc, limit) {
  const rows = dbc.prepare('SELECT d.sha, d.ts, d.title, d.rationale, d.paths, d.kind, d.confidence, c.author, c.added, c.removed, c.files_changed FROM decisions d JOIN commits c ON c.sha = d.sha WHERE c.is_bot = 0').all();
  const scored = rows.map(function (r) {
    const churn = Math.log10(2 + (r.added || 0) + (r.removed || 0));
    const spread = 1 + Math.min(r.files_changed || 1, 20) / 40;
    let s = (r.confidence || 0) * churn * spread;
    if (r.kind === 'fix') s *= 1.3;
    if (r.kind === 'chore') s *= 0.5;
    if (!r.rationale) s *= 0.55;
    const years = Math.max(0, (Date.now() / 1000 - (r.ts || 0)) / 31536000);
    s *= 1 / (1 + years / 10);
    s *= noisePenalty(r);
    return Object.assign({}, r, { score: s });
  });
  scored.sort(function (a, b) { return b.score - a.score; });
  return scored.slice(0, limit || 20);
}

export function openFor(cwd, gd) {
  return openIndex(gd, { create: false });
}
