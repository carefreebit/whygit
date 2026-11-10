/** Risk / cursed-file analytics. */

export function topRisk(dbc, limit) {
  return dbc.prepare('SELECT path, score, commits, authors, fixes, todos, last_ts, added, removed FROM risk ORDER BY score DESC LIMIT ?').all(limit || 20);
}

export function riskFor(dbc, p) {
  return dbc.prepare('SELECT path, score, commits, authors, fixes, todos, last_ts, added, removed FROM risk WHERE path = ?').get(p) || null;
}

export function fileRow(dbc, p) {
  return dbc.prepare('SELECT path, commits, authors, fixes, todos, last_ts, added, removed FROM risk WHERE path = ?').get(p) || null;
}

export function decisionsForFile(dbc, p, limit) {
  return dbc.prepare('SELECT d.sha, d.ts, d.title, d.rationale, d.paths, d.kind, d.confidence, c.author, c.added, c.removed FROM decisions d JOIN commit_files cf ON cf.sha = d.sha JOIN commits c ON c.sha = d.sha WHERE cf.path = ? ORDER BY d.ts ASC LIMIT ?').all(p, limit || 500);
}

export function yearHistogram(dbc, p) {
  return dbc.prepare("SELECT CAST(strftime('%Y', c.ts, 'unixepoch') AS INTEGER) AS year, COUNT(*) AS n FROM commit_files cf JOIN commits c ON c.sha = cf.sha WHERE cf.path = ? GROUP BY year ORDER BY year").all(p);
}

export function chapterCandidates(dbc, p, limit) {
  return dbc.prepare('SELECT d.sha, d.ts, d.title, d.rationale, d.kind, d.confidence, c.author, c.added, c.removed FROM decisions d JOIN commit_files cf ON cf.sha = d.sha JOIN commits c ON c.sha = d.sha WHERE cf.path = ? AND d.rationale != \'\' ORDER BY d.ts ASC LIMIT ?').all(p, limit || 4000);
}

export function authorsForFile(dbc, p) {
  const rows = dbc.prepare('SELECT c.author AS author, c.email AS email, COUNT(*) AS n FROM commit_files cf JOIN commits c ON c.sha = cf.sha WHERE cf.path = ? AND c.is_bot = 0 GROUP BY c.email ORDER BY n DESC LIMIT 40').all(p);
  const byName = new Map();
  for (const r of rows) {
    const key = String(r.author || '').toLowerCase();
    if (byName.has(key)) byName.get(key).n += r.n;
    else byName.set(key, { author: r.author, n: r.n });
  }
  return Array.from(byName.values()).sort(function (a, b) { return b.n - a.n; }).slice(0, 8);
}

export function birthOf(dbc, p) {
  return dbc.prepare('SELECT d.sha, d.ts, d.title, c.author FROM decisions d JOIN commit_files cf ON cf.sha = d.sha JOIN commits c ON c.sha = d.sha WHERE cf.path = ? ORDER BY d.ts ASC LIMIT 1').get(p) || null;
}

export function fixCommitsForFile(dbc, p, limit) {
  return dbc.prepare('SELECT d.sha, d.ts, d.title, d.rationale, d.kind, c.author FROM decisions d JOIN commit_files cf ON cf.sha = d.sha JOIN commits c ON c.sha = d.sha WHERE cf.path = ? AND d.kind = \'fix\' ORDER BY d.ts DESC LIMIT ?').all(p, limit || 6);
}
