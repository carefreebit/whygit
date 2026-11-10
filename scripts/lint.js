/** Zero-dependency hygiene checks: syntax, whitespace, line endings, stray debug output. */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const problems = [];

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(p));
    else if (/\.js$/.test(entry.name)) out.push(p);
  }
  return out;
}

const files = walk(root);
for (const file of files) {
  const rel = path.relative(root, file).replace(/\\/g, '/');
  const text = fs.readFileSync(file, 'utf8');
  if (text.includes('\r\n')) problems.push(rel + ': CRLF line endings');
  if (text.includes('\t')) problems.push(rel + ': tab character');
  text.split('\n').forEach(function (line, i) {
    if (/\s+$/.test(line)) problems.push(rel + ':' + (i + 1) + ': trailing whitespace');
  });
  const allowOut = rel.startsWith('test/') || rel.startsWith('scripts/') || /^src\/(cmd-|cli\.js|install\.js|mcp\.js)/.test(rel);
  if (/\/\/\s*DEBUG|console\.log\(/.test(text) && !allowOut) {
    problems.push(rel + ': console.log or DEBUG marker left in source');
  }
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
  } catch (e) {
    problems.push(rel + ': syntax error');
  }
}

if (problems.length) {
  console.error('lint: ' + problems.length + ' problem(s)');
  for (const p of problems) console.error('  ' + p);
  process.exit(1);
}
console.log('lint: clean (' + files.length + ' files)');
