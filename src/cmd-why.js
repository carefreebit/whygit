/** whygit why - the main question. */
import { c, isoDate, truncate, wrapText, plural } from './util.js';
import { parsePathLine } from './util.js';
import { loadContext, repoLabel } from './context.js';
import { search, decisionFor, decisionsForPath } from './search.js';
import { renderDecision, header, termWidth, renderNote } from './ui.js';
import { blamePorcelain, commitUrl, blameUrl, lsFiles } from './git.js';

export function cmdWhy(args, flags) {
  const query = args.join(' ').trim();
  if (!query) {
    console.error('usage: whygit why <words...> | <file>:<line>');
    return 2;
  }
  const ctx = loadContext({ cwd: flags.cwd });
  const started = Date.now();
  const pl = parsePathLine(query);
  const isLine = pl.line != null && /[./\\]/.test(pl.path);
  let results = [];
  let alias = null;
  if (isLine) {
    const target = resolvePath(ctx, pl.path);
    if (!target) {
      console.log(header('whygit', repoLabel(ctx)));
      console.log(renderNote('No file named ' + c.bold(pl.path) + ' at HEAD. History may know it under another path.', 'warn'));
      console.log(renderNote('Tip: ' + c.bold('whygit story <file>') + ' narrates one file from birth to HEAD.'));
      return 0;
    }
    if (target !== pl.path) alias = target;
    results = whyLine(ctx, target, pl.line);
  } else {
    results = whyQuery(ctx, query, flags);
  }
  if (flags.json) {
    console.log(JSON.stringify(results, null, 2));
    return 0;
  }
  if (!results.length) {
    console.log(header('whygit', repoLabel(ctx)));
    console.log(renderNote('No decision matched. Try fewer words, or a file path.', 'warn'));
    console.log(renderNote('Tip: ' + c.bold('whygit story <file>') + ' narrates one file from birth to HEAD.'));
    return 0;
  }
  console.log(header('whygit', repoLabel(ctx) + '  ' + ctx.stats.commits.toLocaleString('en-US') + ' commits'));
  const max = flags.n || flags.limit || (isLine ? 4 : 5);
  results.slice(0, max).forEach(function (d, i) {
    const extra = [];
    if (alias && i === 0) extra.push(c.gray('resolved ') + c.bold(alias) + c.gray(' (path moved; history kept)'));
    if (d.alive != null) {
      extra.push(c.gray('line ' + pl.line + ' is ') + c.cyan(d.alive + ' lines') + c.gray(' of this change, still in HEAD'));
    }
    if (ctx.webUrl && d.sha) {
      const url = commitUrl(ctx.webUrl, d.sha);
      if (url) extra.push(c.gray('\u2192 ') + c.underline(c.dim(url)));
    }
    console.log(renderDecision(d, { index: i + 1, extra: extra }));
  });
  const ms = Date.now() - started;
  console.log('');
  const shown = Math.min(results.length, max);
  const label = results.length > shown ? shown + ' of ' + results.length + ' decisions' : plural(results.length, 'decision');
  console.log(c.gray('  ' + label + ' \u00b7 ' + ms + 'ms \u00b7 whygit why "' + truncate(query, 40) + '"'));
  console.log('');
  return 0;
}

function whyQuery(ctx, query, flags) {
  const rows = search(ctx.db, query, { limit: (flags.n || 5) * 3 });
  return rows.map(function (r) {
    return Object.assign({}, r, { ts: r.ts });
  });
}

function resolvePath(ctx, p) {
  const files = lsFiles(ctx.cwd);
  const set = new Set(files);
  if (set.has(p)) return p;
  const bySuffix = files.filter(function (f) { return f.endsWith('/' + p) || f.endsWith(p); });
  return bySuffix.length === 1 ? bySuffix[0] : null;
}

function whyLine(ctx, file, line) {
  const blame = blamePorcelain(ctx.cwd, file, null);
  const entry = blame[line - 1];
  if (!entry) return [];
  const d = decisionFor(ctx.db, entry.sha);
  const out = [];
  if (d) {
    const same = blame.filter(function (b) { return b && b.sha === entry.sha; }).length;
    out.push(Object.assign({}, d, { alive: same, lineText: entry.text }));
  } else {
    out.push({
      sha: entry.sha,
      ts: entry.ts,
      title: '(commit not in index - run whygit init --full)',
      rationale: '',
      kind: 'change',
      paths: file,
      alive: 0,
    });
  }
  const history = decisionsForPath(ctx.db, file, 6).filter(function (x) { return x.sha !== entry.sha; });
  for (const h of history) out.push(Object.assign({}, h, { kind: h.kind }));
  return out;
}
