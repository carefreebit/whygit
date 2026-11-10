/** Rewrite repository URLs to a new GitHub owner: node scripts/set-owner.js <owner> */
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const owner = process.argv[2];
if (!owner || !/^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/.test(owner)) {
  console.error('usage: node scripts/set-owner.js <github-owner>');
  process.exit(2);
}

const targets = ['README.md', 'README.zh-CN.md', 'package.json'];
const from = /github\.com\/(?:whygit|USER)\/(whygit)/g;
let changed = 0;
for (const rel of targets) {
  const file = path.join(root, rel);
  if (!fs.existsSync(file)) continue;
  const before = fs.readFileSync(file, 'utf8');
  const after = before.replace(from, 'github.com/' + owner + '/$1');
  if (after !== before) {
    fs.writeFileSync(file, after);
    changed++;
    console.log('updated ' + rel);
  }
}
if (!changed) console.log('nothing to change (already pointing at ' + owner + ')');
