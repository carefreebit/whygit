/** Terminal rendering helpers. */
import { c, width, padEnd, truncate, wrapText, isoDate, relativeTime, plural, stripAnsi } from './util.js';

export function termWidth() {
  return Math.max(60, Math.min(100, (process.stdout.columns || 90) - 2));
}

export function header(title, subtitle) {
  const w = termWidth();
  const line = c.gray('\u2500'.repeat(Math.min(w, Math.max(28, width(stripAnsi(title)) + 30))));
  const parts = [c.bold(title)];
  if (subtitle) parts.push(c.dim(subtitle));
  return '\n  ' + parts.join('  ') + '\n  ' + line + '\n';
}

export function badge(kind) {
  if (kind === 'fix') return c.red('fix');
  if (kind === 'chore') return c.gray('chore');
  if (kind === 'revert') return c.magenta('revert');
  return c.blue('change');
}

export function bar(value, max, size) {
  const n = Math.max(0, Math.min(size || 12, Math.round(((value || 0) / (max || 1)) * (size || 12))));
  return c.cyan('\u2588'.repeat(n)) + c.gray('\u00b7'.repeat((size || 12) - n));
}

export function sparkline(values) {
  const chars = '\u2581\u2582\u2583\u2584\u2585\u2586\u2587\u2588';
  const max = Math.max.apply(null, values.concat([1]));
  return values.map(function (v) { return chars[Math.min(7, Math.round((v / max) * 7))]; }).join('');
}

/** One decision, rendered for humans. */
export function renderDecision(d, opts) {
  const o = opts || {};
  const w = termWidth();
  const indent = o.indent == null ? '  ' : o.indent;
  const lines = [];
  const num = o.index != null ? c.gray(String(o.index).padStart(2) + '. ') : '';
  lines.push('');
  lines.push(indent + num + c.bold(truncate(d.title || '(untitled)', w - 6)));
  const meta = [];
  if (d.ts) meta.push(isoDate(d.ts));
  if (d.sha) meta.push(c.gray(d.sha.slice(0, 8)));
  if (d.author) meta.push(d.author);
  if (d.kind) meta.push(badge(d.kind));
  if (d.match != null) meta.push(c.gray(d.match + '% match'));
  else if (d.score != null) meta.push(c.gray('score ' + (d.score).toFixed(2)));
  lines.push(indent + '  ' + meta.join(c.gray(' \u00b7 ')));
  if (d.rationale) {
    const body = wrapText(d.rationale, w - 6, indent + '  ');
    lines.push('');
    for (const l of body) lines.push(c.white(l));
  }
  if (d.paths) {
    const list = String(d.paths).split(/\s+/).filter(Boolean).slice(0, o.maxPaths || 3);
    if (list.length) {
      lines.push('');
      lines.push(indent + '  ' + c.cyan(list.join('  ')));
    }
  }
  if (o.extra) for (const e of o.extra) lines.push(indent + '  ' + e);
  return lines.join('\n');
}

export function renderNote(text, kind) {
  const w = termWidth();
  const icon = kind === 'warn' ? c.yellow('!') : kind === 'ok' ? c.green('\u2713') : c.gray('\u00b7');
  return '  ' + icon + ' ' + wrapText(text, w - 6, '  ').join('\n').trimStart();
}

export function renderTable(rows, cols, opts) {
  const o = opts || {};
  const widths = cols.map(function (col) {
    return Math.max(col.label.length, ...rows.map(function (r) { return width(String(col.value(r))); }));
  });
  const out = [];
  const head = cols.map(function (col, i) { return padEnd(c.gray(col.label.toUpperCase()), widths[i] + (i ? 2 : 0)); }).join(' ');
  out.push('  ' + head);
  out.push('  ' + c.gray('\u2500'.repeat(Math.min(termWidth(), head.length))));
  for (const r of rows) {
    const line = cols.map(function (col, i) {
      const v = String(col.value(r));
      return padEnd(i === 0 ? truncate(v, widths[i]) : v, widths[i] + (i ? 2 : 0));
    }).join(' ');
    out.push('  ' + line);
  }
  return out.join('\n');
}

export function banner() {
  return [
    '',
    '  ' + c.bold(c.cyan('whygit')) + c.gray('  \u2014  git blame tells you who. whygit tells you why.'),
    '',
  ].join('\n');
}

export function kv(pairs) {
  const w = Math.max.apply(null, pairs.map(function (p) { return p[0].length; }));
  return pairs.map(function (p) { return '  ' + c.gray(padEnd(p[0], w)) + '  ' + p[1]; }).join('\n');
}
