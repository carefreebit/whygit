/** SQLite storage for the whygit index. */
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

export const SCHEMA_VERSION = '2';

const SCHEMA = [
  "CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);",
  "CREATE TABLE IF NOT EXISTS commits (sha TEXT PRIMARY KEY, ts INTEGER, iso TEXT, author TEXT, email TEXT, subject TEXT, body TEXT, parents TEXT, is_bot INTEGER DEFAULT 0, files_changed INTEGER DEFAULT 0, added INTEGER DEFAULT 0, removed INTEGER DEFAULT 0, paths TEXT DEFAULT '');",
  "CREATE TABLE IF NOT EXISTS commit_files (sha TEXT, path TEXT, added INTEGER, removed INTEGER, status TEXT, PRIMARY KEY (sha, path));",
  "CREATE INDEX IF NOT EXISTS idx_commit_files_path ON commit_files(path);",
  "CREATE TABLE IF NOT EXISTS decisions (sha TEXT PRIMARY KEY, ts INTEGER, title TEXT, rationale TEXT, paths TEXT, kind TEXT, confidence REAL, evidence TEXT);",
  "CREATE VIRTUAL TABLE IF NOT EXISTS decisions_fts USING fts5(title, rationale, paths, subject, tokenize='porter unicode61');",
  "CREATE VIRTUAL TABLE IF NOT EXISTS decisions_tri USING fts5(title, rationale, paths, tokenize='trigram');",
  "CREATE TABLE IF NOT EXISTS notes (id INTEGER PRIMARY KEY AUTOINCREMENT, path TEXT, line INTEGER, sha TEXT, body TEXT, ts INTEGER);",
  "CREATE TABLE IF NOT EXISTS risk (path TEXT PRIMARY KEY, score REAL, commits INTEGER, authors INTEGER, fixes INTEGER, todos INTEGER, last_ts INTEGER, added INTEGER, removed INTEGER);",
  "CREATE TABLE IF NOT EXISTS blame_cache (path TEXT, head TEXT, data TEXT, PRIMARY KEY (path, head));",
].join(' ');

export function indexPath(gitDirPath) {
  return path.join(gitDirPath, 'whygit', 'index.db');
}

export function openIndex(gitDirPath, opts) {
  const o = opts || {};
  const file = indexPath(gitDirPath);
  if (!o.create && !fs.existsSync(file)) return null;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const dbc = new DatabaseSync(file);
  dbc.exec('PRAGMA journal_mode = WAL;');
  dbc.exec('PRAGMA synchronous = NORMAL;');
  dbc.exec('PRAGMA temp_store = MEMORY;');
  dbc.exec(SCHEMA);
  const v = getMeta(dbc, 'schema');
  if (v && v !== SCHEMA_VERSION) {
    for (const t of ['decisions_fts', 'decisions_tri', 'decisions', 'commits', 'commit_files', 'risk', 'blame_cache']) {
      dbc.exec('DROP TABLE IF EXISTS ' + t + ';');
    }
    dbc.exec('DELETE FROM meta;');
    dbc.exec(SCHEMA);
  }
  setMeta(dbc, 'schema', SCHEMA_VERSION);
  return dbc;
}

export function getMeta(dbc, key) {
  const row = dbc.prepare('SELECT value FROM meta WHERE key = ?').get(key);
  return row ? row.value : null;
}

export function setMeta(dbc, key, value) {
  dbc.prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, String(value));
}

export function tx(dbc, fn) {
  dbc.exec('BEGIN');
  try {
    const out = fn();
    dbc.exec('COMMIT');
    return out;
  } catch (err) {
    dbc.exec('ROLLBACK');
    throw err;
  }
}

export function dbStats(dbc) {
  const one = function (sql) { const r = dbc.prepare(sql).get(); return r ? Object.values(r)[0] : 0; };
  return {
    commits: one('SELECT COUNT(*) FROM commits'),
    decisions: one('SELECT COUNT(*) FROM decisions'),
    files: one('SELECT COUNT(DISTINCT path) FROM commit_files'),
    notes: one('SELECT COUNT(*) FROM notes'),
  };
}
