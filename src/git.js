/** Thin, fast wrappers around the git CLI. No shell, no dependencies. */
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const MAX_BUFFER = 1024 * 1024 * 1024;

export class GitError extends Error {
  constructor(args, stderr, code) {
    super('git ' + args.join(' ') + ' failed: ' + String(stderr || '').trim().slice(0, 500));
    this.name = 'GitError';
    this.code = code;
    this.args = args;
  }
}

/** Run git and return stdout as utf8. Throws GitError on failure. */
export function git(args, opts) {
  const o = opts || {};
  try {
    return execFileSync('git', args, {
      cwd: o.cwd,
      input: o.input,
      encoding: 'utf8',
      maxBuffer: o.maxBuffer || MAX_BUFFER,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: Object.assign({}, process.env, { GIT_PAGER: 'cat', GIT_OPTIONAL_LOCKS: '0' }),
    });
  } catch (err) {
    throw new GitError(args, err.stderr || err.message, err.status);
  }
}

/** Run git, returning null instead of throwing. */
export function tryGit(args, opts) {
  try {
    return git(args, opts);
  } catch {
    return null;
  }
}

export function isRepo(cwd) {
  return tryGit(['rev-parse', '--is-inside-work-tree'], { cwd }) === 'true\n';
}

export function repoRoot(cwd) {
  return git(['rev-parse', '--show-toplevel'], { cwd }).trim();
}

export function gitDir(cwd) {
  return path.resolve(cwd, git(['rev-parse', '--git-dir'], { cwd }).trim());
}

export function headSha(cwd) {
  return (tryGit(['rev-parse', 'HEAD'], { cwd }) || '').trim() || null;
}

export function isShallow(cwd) {
  return String(tryGit(['rev-parse', '--is-shallow-repository'], { cwd }) || '').trim() === 'true';
}

export function branchName(cwd) {
  const name = String(tryGit(['rev-parse', '--abbrev-ref', 'HEAD'], { cwd }) || '').trim();
  return name && name !== 'HEAD' ? name : null;
}

/** Normalise the origin remote into a browsable https URL, or null. */
export function remoteWebUrl(cwd) {
  const raw = (tryGit(['config', '--get', 'remote.origin.url'], { cwd }) || '').trim().replace(/\.git$/, '');
  if (!raw) return null;
  if (/^https?:\/\//.test(raw)) return raw.replace(/\/$/, '');
  if (/^git@[^:]+:/.test(raw)) {
    const m = raw.match(/^git@([^:]+):(.+)$/);
    return 'https://' + m[1] + '/' + m[2];
  }
  if (/^ssh:\/\//.test(raw)) {
    const m = raw.match(/^ssh:\/\/(?:git@)?([^/]+)\/(.+)$/);
    if (m) return 'https://' + m[1] + '/' + m[2];
  }
  return null;
}

export function commitUrl(webUrl, sha) {
  return webUrl ? webUrl + '/commit/' + sha : null;
}

export function blameUrl(webUrl, branch, file, line) {
  if (!webUrl || !branch) return null;
  const enc = file.split('/').map(encodeURIComponent).join('/');
  return webUrl + '/blame/' + encodeURIComponent(branch) + '/' + enc + '#L' + line;
}

/** All tracked files. */
export function lsFiles(cwd) {
  const out = tryGit(['ls-files', '-z'], { cwd });
  if (!out) return [];
  return out.split('\0').filter(Boolean);
}

export function revParse(cwd, rev) {
  const out = tryGit(['rev-parse', '--verify', '--quiet', rev + '^{commit}'], { cwd });
  return out ? out.trim() : null;
}

export function mergeBase(cwd, a, b) {
  const out = tryGit(['merge-base', a, b], { cwd });
  return out ? out.trim() : null;
}

export function currentUser(cwd) {
  return {
    name: (tryGit(['config', 'user.name'], { cwd }) || '').trim(),
    email: (tryGit(['config', 'user.email'], { cwd }) || '').trim(),
  };
}

export function shortSha(sha) {
  return String(sha || '').slice(0, 8);
}

export function diffNameStatus(cwd, base, head) {
  const out = tryGit(['diff', '--name-status', '-M', base, head], { cwd });
  const rows = [];
  for (const line of String(out || '').split('\n')) {
    if (!line.trim()) continue;
    const parts = line.split('\t');
    const status = parts[0][0];
    if (status === 'R' || status === 'C') {
      rows.push({ status: status, oldPath: parts[1], path: parts[2] });
    } else {
      rows.push({ status: status, oldPath: null, path: parts[1] });
    }
  }
  return rows;
}

export function diffHunks(cwd, base, head) {
  const out = tryGit(['diff', '--unified=0', '--no-color', '--no-ext-diff', '-M', base, head], { cwd });
  return parseUnifiedDiff(String(out || ''));
}

/** Parse a unified diff (as produced by -U0) into files with hunk ranges. */
export function parseUnifiedDiff(text) {
  const files = [];
  let cur = null;
  let hunk = null;
  for (const line of String(text).split('\n')) {
    if (line.startsWith('diff --git ')) {
      cur = { path: null, oldPath: null, hunks: [], added: 0, removed: 0, isBinary: false, status: null };
      files.push(cur);
      hunk = null;
      const m = line.match(/^diff --git a\/(.+?) b\/(.+)$/);
      if (m) { cur.oldPath = m[1]; cur.path = m[2]; }
      continue;
    }
    if (!cur) continue;
    if (line.startsWith('new file mode')) { cur.status = 'A'; continue; }
    if (line.startsWith('deleted file mode')) { cur.status = 'D'; continue; }
    if (line.startsWith('rename from ')) { cur.oldPath = line.slice(11).trim(); continue; }
    if (line.startsWith('rename to ')) { cur.path = line.slice(9).trim(); continue; }
    if (line.startsWith('Binary files ')) { cur.isBinary = true; continue; }
    if (line.startsWith('+++ ')) {
      const p = line.slice(4).trim();
      if (p !== '/dev/null') cur.path = p.replace(/^b\//, '');
      continue;
    }
    if (line.startsWith('--- ')) {
      const p = line.slice(4).trim();
      if (p !== '/dev/null') cur.oldPath = p.replace(/^a\//, '');
      continue;
    }
    if (line.startsWith('@@ ')) {
      const m = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
      if (m) {
        hunk = {
          oldStart: Number(m[1]),
          oldLines: m[2] === undefined ? 1 : Number(m[2]),
          newStart: Number(m[3]),
          newLines: m[4] === undefined ? 1 : Number(m[4]),
          added: [],
          removed: [],
        };
        cur.hunks.push(hunk);
      }
      continue;
    }
    if (line.startsWith('+') && !line.startsWith('+++')) {
      if (hunk) hunk.added.push(line.slice(1));
      cur.added += 1;
      continue;
    }
    if (line.startsWith('-') && !line.startsWith('---')) {
      if (hunk) hunk.removed.push(line.slice(1));
      cur.removed += 1;
      continue;
    }
  }
  return files.filter(function (f) { return f.path; });
}

export function showCommit(cwd, sha, paths) {
  const args = ['show', '--no-color', '--no-ext-diff', '--unified=2', '--format=%H%x1f%an%x1f%ae%x1f%at%x1f%s%x1f%b', sha];
  if (paths && paths.length) args.push('--', ...paths);
  const out = tryGit(args, { cwd });
  if (!out) return null;
  const sep = out.indexOf('\n');
  const header = out.slice(0, sep < 0 ? out.length : sep);
  const fields = header.split('\x1f');
  const diffText = out.slice(sep + 1);
  return {
    sha: fields[0],
    author: fields[1],
    email: fields[2],
    ts: Number(fields[3]),
    subject: fields[4],
    body: (fields[5] || '').trim(),
    diff: parseUnifiedDiff(diffText),
    raw: out,
  };
}

/** Line-level blame for one file. Index 0 is line 1. */
export function blamePorcelain(cwd, file, rev) {
  const args = ['blame', '--porcelain'];
  if (rev) args.push(rev);
  args.push('--', file);
  const out = tryGit(args, { cwd });
  if (!out) return [];
  const lines = [];
  let cur = null;
  for (const raw of out.split('\n')) {
    if (!raw) continue;
    const head = raw.match(/^([0-9a-f]{40}) (\d+) (\d+)(?: (\d+))?$/);
    if (head) {
      cur = { sha: head[1], line: Number(head[3]), author: '', ts: 0, text: '' };
      lines[cur.line - 1] = cur;
      continue;
    }
    if (!cur) continue;
    if (raw.startsWith('author ')) cur.author = raw.slice(7);
    else if (raw.startsWith('author-time ')) cur.ts = Number(raw.slice(12));
    else if (raw.startsWith('\t')) cur.text = raw.slice(1);
  }
  return lines;
}

export function fileAt(cwd, rev, file) {
  const out = tryGit(['show', rev + ':' + file], { cwd });
  return out == null ? null : out;
}

export function lsTree(cwd, rev) {
  const out = tryGit(['ls-tree', '-r', '--name-only', '-z', rev], { cwd });
  return String(out || '').split('\0').filter(Boolean);
}

/** Full commit metadata (no merges) in one pass. */
export function logMeta(cwd, opts) {
  const o = opts || {};
  const args = ['log', '--no-merges', '--format=%x1e%H%x1f%P%x1f%an%x1f%ae%x1f%at%x1f%cI%x1f%s%x1f%B'];
  if (o.since) args.push(o.since + '..HEAD');
  else if (o.rev) args.push(o.rev);
  args.push('--');
  const out = git(args, { cwd });
  const rows = [];
  for (const rec of out.split('\x1e')) {
    if (!rec) continue;
    const f = rec.split('\x1f');
    if (f.length < 8) continue;
    rows.push({
      sha: f[0],
      parents: f[1].trim() ? f[1].trim().split(' ') : [],
      author: f[2],
      email: f[3],
      ts: Number(f[4]),
      iso: f[5],
      subject: f[6],
      body: (f[7] || '').trim(),
    });
  }
  return rows;
}

/** Per-commit file stats in one pass, keyed by sha. */
export function logNumstat(cwd, opts) {
  const o = opts || {};
  const args = ['log', '--no-merges', '--format=%x1e%H', '--numstat', '-M'];
  if (o.since) args.push(o.since + '..HEAD');
  else if (o.rev) args.push(o.rev);
  args.push('--');
  const out = git(args, { cwd });
  const map = new Map();
  for (const rec of out.split('\x1e')) {
    if (!rec) continue;
    const lines = rec.split('\n').filter(function (l) { return l.trim().length > 0; });
    if (!lines.length) continue;
    const sha = lines[0].trim();
    const files = [];
    for (const line of lines.slice(1)) {
      const parts = line.split('\t');
      if (parts.length < 3) continue;
      files.push({
        added: parts[0] === '-' ? 0 : Number(parts[0]) || 0,
        removed: parts[1] === '-' ? 0 : Number(parts[1]) || 0,
        path: parts[2],
      });
    }
    map.set(sha, files);
  }
  return map;
}
