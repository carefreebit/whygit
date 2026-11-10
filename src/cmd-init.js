/** whygit init / doctor / status. */
import fs from 'node:fs';
import path from 'node:path';
import { c } from './util.js';
import { loadContext, repoLabel, resolveRepo } from './context.js';
import { gitDir, git, headSha, isShallow, revParse } from './git.js';
import { buildIndex, computeRisk, scanMarkers, indexPathFor } from './indexer.js';
import { getMeta, dbStats } from './db.js';
import { header, kv, renderNote } from './ui.js';

export function cmdInit(args, flags) {
  const cwd = resolveRepo(flags.cwd);
  const full = Boolean(flags.full) || !fs.existsSync(indexPathFor(gitDir(cwd)));
  const t0 = Date.now();
  const res = buildIndex({ cwd: cwd, full: full });
  const ctx = loadContext({ cwd: cwd });
  const files = computeRisk(ctx.db);
  const markers = scanMarkers(ctx.db, cwd);
  const stats = dbStats(ctx.db);
  if (flags.json) {
    console.log(JSON.stringify({ indexed: res, stats: stats, files: files, markers: markers }, null, 2));
    return 0;
  }
  console.log(header('index', repoLabel(ctx)));
  console.log('');
  console.log(kv([
    ['commits', stats.commits.toLocaleString('en-US') + c.gray('  (' + res.commits + ' new this run)')],
    ['decisions', stats.decisions.toLocaleString('en-US')],
    ['files', stats.files.toLocaleString('en-US')],
    ['markers', markers.markers + c.gray(' TODO/FIXME in ' + markers.files + ' files')],
    ['time', ((Date.now() - t0) / 1000).toFixed(2) + 's'],
  ]));
  console.log('');
  if (isShallow(cwd)) console.log(renderNote('Shallow clone: history is partial. git fetch --unshallow for the full story.', 'warn'));
  if (!stats.commits) console.log(renderNote('No commits indexed - is this a fresh repo?', 'warn'));
  console.log(renderNote('Next: ' + c.bold('whygit why "timeout"') + ' or ' + c.bold('whygit cursed'), 'ok'));
  return 0;
}

export function cmdDoctor(args, flags) {
  const cwd = resolveRepo(flags.cwd);
  const gd = gitDir(cwd);
  const checks = [];
  const add = function (name, ok, detail) { checks.push({ name: name, ok: ok, detail: detail }); };
  add('git', Boolean(headSha(cwd)), (function () { try { return git(['--version'], { cwd: cwd }).trim(); } catch { return 'not found'; } })());
  add('repository', true, cwd);
  const idx = indexPathFor(gd);
  const has = fs.existsSync(idx);
  add('index', has, has ? idx + ' (' + Math.round(fs.statSync(idx).size / 1024) + ' KB)' : 'missing - run whygit init');
  if (has) {
    const ctx = loadContext({ cwd: cwd });
    const head = headSha(cwd);
    const meta = getMeta(ctx.db, 'head');
    add('up to date', meta === head, meta === head ? 'indexed at ' + String(meta).slice(0, 8) : 'stale: indexed ' + String(meta).slice(0, 8) + ' vs HEAD ' + String(head).slice(0, 8));
    add('shallow', !isShallow(cwd), isShallow(cwd) ? 'partial history' : 'full history');
    const wl = path.join(cwd, 'WHYLOG.md');
    add('whylog', fs.existsSync(wl), fs.existsSync(wl) ? 'WHYLOG.md present' : 'not written yet - whygit whylog --write');
  }
  if (flags.json) {
    console.log(JSON.stringify(checks, null, 2));
    return checks.every(function (x) { return x.ok; }) ? 0 : 1;
  }
  console.log(header('doctor', repoLabel({ cwd: cwd, webUrl: null })));
  console.log('');
  for (const ch of checks) {
    console.log('  ' + (ch.ok ? c.green('\u2713') : c.red('\u2717')) + ' ' + ch.name.padEnd(12) + ' ' + c.gray(ch.detail));
  }
  console.log('');
  return checks.every(function (x) { return x.ok; }) ? 0 : 1;
}

export function cmdStatus(args, flags) {
  const ctx = loadContext({ cwd: flags.cwd });
  if (flags.json) {
    console.log(JSON.stringify({ repo: repoLabel(ctx), stats: ctx.stats, head: ctx.head, branch: ctx.branch }, null, 2));
    return 0;
  }
  console.log(header('whygit', repoLabel(ctx)));
  console.log('');
  console.log(kv([
    ['commits', ctx.stats.commits.toLocaleString('en-US')],
    ['decisions', ctx.stats.decisions.toLocaleString('en-US')],
    ['files', ctx.stats.files.toLocaleString('en-US')],
    ['branch', ctx.branch || '(detached)'],
    ['head', String(ctx.head || '').slice(0, 8)],
    ['whylog', fs.existsSync(path.join(ctx.cwd, 'WHYLOG.md')) ? c.green('yes') : c.gray('no')],
  ]));
  console.log('');
  console.log(c.gray('  whygit why <question>   \u00b7   whygit story <file>   \u00b7   whygit cursed'));
  console.log('');
  return 0;
}
