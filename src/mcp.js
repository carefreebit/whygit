/** Minimal, dependency-free MCP server over stdio (newline-delimited JSON). */
import { loadContext, repoLabel } from './context.js';
import { search, decisionFor } from './search.js';
import { blamePorcelain, commitUrl, remoteWebUrl } from './git.js';
import { decisionsForFile, fileRow, topRisk, authorsForFile } from './risk.js';
import { buildWhylog } from './whylog.js';
import fs from 'node:fs';
import path from 'node:path';

const PROTOCOL_VERSION = '2024-11-05';
const SERVER_INFO = { name: 'whygit', version: '0.1.0' };

const TOOLS = [
  {
    name: 'why_search',
    description: 'Search this repository history for the reason behind a piece of code or a past decision. Use when the user asks why code is written a certain way, or before changing code whose intent is unclear.',
    inputSchema: { type: 'object', properties: { query: { type: 'string', description: 'Words describing the behaviour or decision, e.g. "retry on 503" or "why proxy auth is stripped".' }, limit: { type: 'number', default: 5 } }, required: ['query'] },
  },
  {
    name: 'why_line',
    description: 'Explain a single file:line - which commit introduced it, what that commit said about why, and whether the line is still the original.',
    inputSchema: { type: 'object', properties: { file: { type: 'string' }, line: { type: 'number' } }, required: ['file', 'line'] },
  },
  {
    name: 'why_file',
    description: 'The decision history of one file, oldest first - the story of why it looks the way it does.',
    inputSchema: { type: 'object', properties: { path: { type: 'string' }, limit: { type: 'number', default: 12 } }, required: ['path'] },
  },
  {
    name: 'why_risk',
    description: 'The most dangerous files in this repository, ranked by churn, fix-density and author-spread. Use before refactoring or when choosing what to inspect.',
    inputSchema: { type: 'object', properties: { limit: { type: 'number', default: 10 } } },
  },
  {
    name: 'whylog_read',
    description: 'Read WHYLOG.md - the curated, generated summary of this repository\'s load-bearing decisions. Prefer this over reading the whole history.',
    inputSchema: { type: 'object', properties: {} },
  },
];

function textResult(obj) {
  const text = typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2);
  return { content: [{ type: 'text', text: text }] };
}

function slim(r) {
  return {
    commit: r.sha,
    date: r.ts ? new Date(r.ts * 1000).toISOString().slice(0, 10) : null,
    title: r.title,
    why: r.rationale || null,
    paths: r.paths ? String(r.paths).split(/\s+/).slice(0, 5) : [],
    author: r.author || null,
    kind: r.kind,
  };
}

export function createServer(opts) {
  const o = opts || {};
  let ctx = null;
  const ensure = function () {
    if (!ctx) ctx = loadContext({ cwd: o.cwd || process.cwd() });
    return ctx;
  };

  const handlers = {
    why_search: function (a) {
      const cx = ensure();
      const rows = search(cx.db, String(a.query || ''), { limit: a.limit || 5 });
      return textResult({ repo: repoLabel(cx), query: a.query, results: rows.map(slim) });
    },
    why_line: function (a) {
      const cx = ensure();
      const file = String(a.file || '');
      const line = Number(a.line);
      const blame = blamePorcelain(cx.cwd, file, null);
      const b = blame[line - 1];
      if (!b) return textResult({ error: 'no such line: ' + file + ':' + line });
      const d = decisionFor(cx.db, b.sha) || { sha: b.sha, ts: b.ts, title: '(unindexed commit)', rationale: '', paths: file };
      const alive = blame.filter(function (x) { return x && x.sha === b.sha; }).length;
      return textResult({
        file: file,
        line: line,
        code: b.text,
        introduced_by: slim(d),
        lines_from_same_commit: alive,
        url: commitUrl(cx.webUrl, b.sha),
      });
    },
    why_file: function (a) {
      const cx = ensure();
      const p = String(a.path || '').replace(/\\/g, '/');
      const rows = decisionsForFile(cx.db, p, a.limit || 12);
      const stats = fileRow(cx.db, p);
      return textResult({ file: p, stats: stats, decisions: rows.map(slim) });
    },
    why_risk: function (a) {
      const cx = ensure();
      return textResult({ files: topRisk(cx.db, a.limit || 10) });
    },
    whylog_read: function () {
      const cx = ensure();
      const f = path.join(cx.cwd, 'WHYLOG.md');
      if (fs.existsSync(f)) return textResult(fs.readFileSync(f, 'utf8'));
      return textResult(buildWhylog(cx, { label: repoLabel(cx) }));
    },
  };

  function handle(msg) {
    const id = msg.id;
    const method = msg.method;
    if (method === 'initialize') {
      return { jsonrpc: '2.0', id: id, result: { protocolVersion: PROTOCOL_VERSION, capabilities: { tools: {}, resources: {} }, serverInfo: SERVER_INFO } };
    }
    if (method === 'notifications/initialized' || method === 'notifications/cancelled') return null;
    if (method === 'ping') return { jsonrpc: '2.0', id: id, result: {} };
    if (method === 'tools/list') return { jsonrpc: '2.0', id: id, result: { tools: TOOLS } };
    if (method === 'tools/call') {
      const name = msg.params && msg.params.name;
      const fn = handlers[name];
      if (!fn) return { jsonrpc: '2.0', id: id, error: { code: -32602, message: 'unknown tool ' + name } };
      try {
        return { jsonrpc: '2.0', id: id, result: fn((msg.params && msg.params.arguments) || {}) };
      } catch (err) {
        return { jsonrpc: '2.0', id: id, error: { code: -32000, message: String(err && err.message || err) } };
      }
    }
    if (method === 'resources/list') {
      return { jsonrpc: '2.0', id: id, result: { resources: [{ uri: 'whygit://whylog', name: 'WHYLOG.md', mimeType: 'text/markdown', description: 'Generated summary of load-bearing decisions.' }] } };
    }
    if (method === 'resources/read') {
      const uri = msg.params && msg.params.uri;
      if (uri === 'whygit://whylog') {
        const r = handlers.whylog_read({});
        return { jsonrpc: '2.0', id: id, result: { contents: [{ uri: uri, mimeType: 'text/markdown', text: r.content[0].text }] } };
      }
      return { jsonrpc: '2.0', id: id, error: { code: -32602, message: 'unknown resource' } };
    }
    if (id === undefined) return null;
    return { jsonrpc: '2.0', id: id, error: { code: -32601, message: 'method not found: ' + method } };
  }

  function start() {
    let buf = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', function (chunk) {
      buf += chunk;
      let idx;
      while ((idx = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, idx).trim();
        buf = buf.slice(idx + 1);
        if (!line) continue;
        let msg;
        try { msg = JSON.parse(line); } catch { continue; }
        let res;
        try { res = handle(msg); } catch (err) { res = { jsonrpc: '2.0', id: msg.id, error: { code: -32603, message: String(err.message) } }; }
        if (res) process.stdout.write(JSON.stringify(res) + '\n');
      }
    });
    process.stdin.on('end', function () { process.exit(0); });
    process.stderr.write('whygit mcp: ready (stdio)\n');
  }

  return { start: start, handle: handle, tools: TOOLS };
}

export function cmdMcp(args, flags) {
  const server = createServer({ cwd: flags.cwd });
  server.start();
  return 0;
}
