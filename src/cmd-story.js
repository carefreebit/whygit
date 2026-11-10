/** whygit story - narrate one file's life. */
import { c, isoDate, truncate, wrapText, plural, clamp } from './util.js';
import { loadContext, repoLabel } from './context.js';
import { decisionsForFile, fileRow, authorsForFile, birthOf, yearHistogram, chapterCandidates } from './risk.js';
import { header, bar, termWidth, renderNote } from './ui.js';
import { lsFiles } from './git.js';

export function cmdStory(args, flags) {
  const file = String(args[0] || '').replace(/\\/g, '/');
  if (!file) {
    console.error('usage: whygit story <path>');
    return 2;
  }
  const ctx = loadContext({ cwd: flags.cwd });
  let target = file;
  if (!ctx.db.prepare('SELECT 1 FROM commit_files WHERE path = ? LIMIT 1').get(target)) {
    const matches = lsFiles(ctx.cwd).filter(function (p) { return p.toLowerCase().includes(file.toLowerCase()); });
    if (matches.length === 1) target = matches[0];
    else if (matches.length > 1) {
      console.log(renderNote('Multiple files match: ' + matches.slice(0, 6).join(', '), 'warn'));
      return 0;
    } else {
      console.log(renderNote('No history for ' + file + ' - it may be untracked or never committed.', 'warn'));
      return 0;
    }
  }
  const rows = decisionsForFile(ctx.db, target, 4000);
  const stats = fileRow(ctx.db, target);
  const authors = authorsForFile(ctx.db, target);
  const birth = birthOf(ctx.db, target) || rows[0];
  if (flags.json) {
    console.log(JSON.stringify({ file: target, stats: stats, birth: birth, authors: authors, decisions: rows }, null, 2));
    return 0;
  }
  console.log(header('story', repoLabel(ctx) + '  ' + target));
  if (birth) {
    console.log(c.gray('  born ') + isoDate(birth.ts) + c.gray(' \u00b7 ') + c.bold(truncate(birth.title, 70)));
  }
  const hist = yearHistogram(ctx.db, target);
  const years = new Map();
  for (const h of hist) years.set(h.year, h.n);
  const yKeys = Array.from(years.keys()).sort();
  if (yKeys.length) {
    const counts = yKeys.map(function (y) { return years.get(y); });
    const max = Math.max.apply(null, counts);
    console.log('');
    const labelW = 6;
    for (let i = 0; i < yKeys.length; i++) {
      const s = String(yKeys[i]);
      console.log('  ' + c.gray(s.padStart(labelW)) + '  ' + bar(counts[i], max, Math.min(40, termWidth() - 16)) + '  ' + c.gray(counts[i] + ''));
    }
  }
  console.log('');
  console.log(c.gray('  ' + (stats ? plural(stats.commits, 'commit') + ' \u00b7 ' + stats.authors + ' authors \u00b7 ' + (stats.fixes || 0) + ' fixes \u00b7 ' + (stats.todos || 0) + ' TODO markers' : '')));
  const scored = chapterCandidates(ctx.db, target).map(function (r) {
    const churn = Math.log10(2 + (r.added || 0) + (r.removed || 0));
    const s = (0.25 + (r.confidence || 0)) * churn * (r.kind === 'fix' ? 1.4 : 1);
    return Object.assign({}, r, { weight: s });
  });
  console.log(c.gray('  \u2500\u2500\u2500 the plot ' + '\u2500'.repeat(Math.max(0, Math.min(50, termWidth() - 20)))));
  const top = scored.slice().sort(function (a, b) { return b.weight - a.weight; }).slice(0, 24);
  const ordered = top.slice().sort(function (a, b) { return a.ts - b.ts; });
  const pick = ordered.length > 8 ? sample(ordered, 8) : ordered;
  for (const r of pick) {
    console.log('');
    console.log('  ' + c.gray(isoDate(r.ts)) + '  ' + c.bold(truncate(r.title, termWidth() - 16)));
    if (r.rationale) {
      const lines = wrapText(r.rationale, termWidth() - 10, '            ');
      for (const l of lines) console.log(c.white(l));
    }
  }
  if (authors.length) {
    console.log('');
    console.log(c.gray('  who kept it alive: ') + authors.slice(0, 5).map(function (a) { return a.author + ' (' + a.n + ')'; }).join(', '));
  }
  console.log('');
  return 0;
}

function sample(arr, n) {
  const out = [];
  const step = Math.max(1, Math.floor(arr.length / n));
  for (let i = 0; i < arr.length && out.length < n; i += step) out.push(arr[i]);
  return out;
}
