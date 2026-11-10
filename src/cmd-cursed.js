/** whygit cursed - the files that keep coming back. */
import { c, isoDate, truncate, plural } from './util.js';
import { loadContext, repoLabel } from './context.js';
import { topRisk } from './risk.js';
import { header, bar, termWidth, renderNote } from './ui.js';
import { lsFiles } from './git.js';

export function cmdCursed(args, flags) {
  const ctx = loadContext({ cwd: flags.cwd });
  const n = flags.n || 15;
  const alive = new Set(lsFiles(ctx.cwd));
  const scored = topRisk(ctx.db, Math.max(n * 6, 120));
  const rows = scored.filter(function (r) { return alive.has(r.path); }).slice(0, n);
  if (flags.json) {
    console.log(JSON.stringify(rows, null, 2));
    return 0;
  }
  const max = Math.max.apply(null, rows.map(function (r) { return r.score; }).concat([1]));
  console.log(header('cursed files', repoLabel(ctx) + '  ' + plural(ctx.stats.files, 'file') + ' tracked'));
  console.log('');
  const width = Math.max.apply(null, rows.map(function (r) { return r.path.length; }).concat([20]));
  rows.forEach(function (r, i) {
    const flame = '\ud83d\udd25'.repeat(Math.max(1, Math.min(5, Math.round((r.score / max) * 5))));
    console.log(
      '  ' + c.gray(String(i + 1).padStart(2)) + '  ' +
      c.bold(truncate(r.path, Math.min(width, termWidth() - 46)).padEnd(Math.min(width, termWidth() - 46))) + '  ' +
      bar(r.score, max, 14) + '  ' +
      c.gray(String(Math.round(r.score * 10) / 10).padStart(5)) + '  ' +
      c.gray(plural(r.commits, 'commit')) + c.gray(' \u00b7 ') + c.gray(r.authors + ' authors') + c.gray(' \u00b7 ') +
      (r.fixes ? c.red(r.fixes + ' fixes') : c.gray('0 fixes'))
    );
  });
  console.log('');
  console.log(c.gray('  score = churn \u00d7 fix-density \u00d7 author-spread \u00d7 freshness. Not a judgement, a map.'));
  console.log(c.gray('  Start here: ') + c.bold('whygit story <file>'));
  console.log('');
  return 0;
}
