/** whygit check - explanation coverage for a change set (CI gate). */
import { c, plural, pct } from './util.js';
import { loadContext, repoLabel } from './context.js';
import { diffHunks, blamePorcelain, mergeBase, revParse } from './git.js';
import { decisionFor } from './search.js';
import { header, renderNote } from './ui.js';

export function cmdCheck(args, flags) {
  const ctx = loadContext({ cwd: flags.cwd });
  const base = flags.base || 'origin/HEAD';
  let baseSha = revParse(ctx.cwd, base);
  if (!baseSha) baseSha = mergeBase(ctx.cwd, 'HEAD', base);
  if (!baseSha) {
    console.log(renderNote('Cannot resolve base ' + base + '. Pass --base <ref>.', 'warn'));
    return 2;
  }
  const files = diffHunks(ctx.cwd, baseSha, 'HEAD');
  const blameCache = new Map();
  const results = [];
  let total = 0;
  let explained = 0;
  let newTodos = 0;
  for (const f of files) {
    if (f.isBinary) continue;
    if (!blameCache.has(f.path)) blameCache.set(f.path, blamePorcelain(ctx.cwd, f.path, null));
    const blame = blameCache.get(f.path);
    let lines = 0;
    let ok = 0;
    for (const h of f.hunks) {
      for (let i = 0; i < h.added.length; i++) {
        const lineNo = h.newStart + i;
        const b = blame[lineNo - 1];
        lines += 1;
        if (/\b(TODO|FIXME|HACK|XXX)\b/.test(h.added[i])) newTodos += 1;
        if (!b) continue;
        const d = decisionFor(ctx.db, b.sha);
        if (d && d.confidence >= 0.5 && d.rationale) ok += 1;
      }
    }
    if (!lines) continue;
    total += lines;
    explained += ok;
    results.push({ path: f.path, lines: lines, explained: ok, ratio: ok / lines });
  }
  results.sort(function (a, b) { return a.ratio - b.ratio; });
  const coverage = total ? explained / total : 1;
  if (flags.json) {
    console.log(JSON.stringify({ base: baseSha, coverage: coverage, lines: total, explained: explained, newTodos: newTodos, files: results }, null, 2));
    return coverage >= (flags.min == null ? 0.5 : flags.min) ? 0 : 1;
  }
  console.log(header('check', repoLabel(ctx) + '  ' + base + '..HEAD'));
  console.log('');
  console.log('  ' + c.bold('explanation coverage') + '  ' + colorPct(coverage) + c.gray('  (' + explained + '/' + total + ' changed lines trace to a commit that said why)'));
  console.log('');
  const worst = results.filter(function (r) { return r.ratio < 0.5; }).slice(0, 8);
  if (worst.length) {
    console.log(c.gray('  thin explanations:'));
    for (const r of worst) {
      console.log('  ' + c.red((' ' + Math.round(r.ratio * 100) + '%').padStart(4)) + '  ' + r.path + c.gray('  ' + plural(r.lines, 'line')));
    }
    console.log('');
    console.log(c.gray('  these lines trace back to commits that never said why.'));
    console.log(c.gray('  fix: amend the message, or add a WHY: <reason> line to the commit body.'));
  } else {
    console.log(renderNote('Every changed line traces back to a stated reason. Nicely done.', 'ok'));
  }
  if (newTodos) {
    console.log('');
    console.log(renderNote(newTodos + ' new TODO/FIXME marker(s) added - they will outlive you.', 'warn'));
  }
  console.log('');
  const min = flags.min == null ? 0.5 : flags.min;
  return coverage >= min ? 0 : 1;
}

function colorPct(v) {
  const s = Math.round(v * 100) + '%';
  if (v >= 0.8) return c.green(s);
  if (v >= 0.5) return c.yellow(s);
  return c.red(s);
}
