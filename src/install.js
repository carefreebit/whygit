/** One-command wiring into agent tools. */
import fs from 'node:fs';
import path from 'node:path';
import { c } from './util.js';
import { header, renderNote } from './ui.js';

const START = '<!-- whygit:start -->';
const END = '<!-- whygit:end -->';

function agentsBlock() {
  return [
    START,
    '## Why the code is the way it is',
    '',
    'This repository keeps a generated WHYLOG.md: every non-obvious decision, with the commit and date behind it.',
    '',
    'Before changing code whose intent is not obvious:',
    '',
    '1. Search WHYLOG.md for the file you are about to touch.',
    '2. If a line there contradicts your plan, trust it until you can explain why it no longer applies.',
    '3. When you make a non-obvious change, put a WHY: <reason> line in the commit body.',
    '',
    'Prefer the MCP tools when available: why_search, why_line, why_file, why_risk, whylog_read.',
    END,
  ].join('\n');
}

export function writeAgentsFile(cwd) {
  const file = path.join(cwd, 'AGENTS.md');
  let text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  const block = agentsBlock();
  const re = new RegExp(START + '[\\s\\S]*?' + END);
  if (re.test(text)) text = text.replace(re, block);
  else text = (text.trim() ? text.trim() + '\n\n' : '') + block + '\n';
  fs.writeFileSync(file, text, 'utf8');
  return file;
}

function serverEntry(command, args) {
  return { command: command, args: args };
}

function mergeJson(file, key, entry) {
  let cur = {};
  if (fs.existsSync(file)) {
    try { cur = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { cur = {}; }
  }
  cur[key] = Object.assign({}, cur[key], { whygit: entry });
  fs.writeFileSync(file, JSON.stringify(cur, null, 2) + '\n', 'utf8');
  return file;
}

export function installFor(agent, cwd, opts) {
  const o = opts || {};
  const cmd = o.command || 'npx';
  const args = o.command ? ['mcp'] : ['-y', 'whygit@latest', 'mcp'];
  const done = [];
  if (agent === 'claude' || agent === 'all') {
    done.push(mergeJson(path.join(cwd, '.mcp.json'), 'mcpServers', serverEntry(cmd, args)));
  }
  if (agent === 'cursor' || agent === 'all') {
    fs.mkdirSync(path.join(cwd, '.cursor'), { recursive: true });
    done.push(mergeJson(path.join(cwd, '.cursor', 'mcp.json'), 'mcpServers', serverEntry(cmd, args)));
  }
  if (agent === 'vscode' || agent === 'all') {
    fs.mkdirSync(path.join(cwd, '.vscode'), { recursive: true });
    const f = path.join(cwd, '.vscode', 'mcp.json');
    let cur = {};
    if (fs.existsSync(f)) { try { cur = JSON.parse(fs.readFileSync(f, 'utf8')); } catch { cur = {}; } }
    cur.servers = Object.assign({}, cur.servers, { whygit: { type: 'stdio', command: cmd, args: args } });
    fs.writeFileSync(f, JSON.stringify(cur, null, 2) + '\n', 'utf8');
    done.push(f);
  }
  if (agent === 'agents' || agent === 'all') done.push(writeAgentsFile(cwd));
  return done;
}

export function cmdInstall(args, flags) {
  const cwd = flags.cwd || process.cwd();
  const agent = flags.agent || args[0] || 'all';
  const known = ['claude', 'cursor', 'vscode', 'agents', 'all'];
  if (!known.includes(agent)) {
    console.log(renderNote('Unknown agent: ' + agent + '. Use one of ' + known.join(', '), 'warn'));
    return 2;
  }
  const written = installFor(agent, cwd, { command: flags.local ? 'whygit' : null });
  console.log(header('install', agent));
  console.log('');
  for (const f of written) console.log('  ' + c.green('\u2713') + ' ' + path.relative(cwd, f));
  console.log('');
  console.log(c.gray('  Restart your editor / agent session to pick up the MCP server.'));
  if (!flags.local) console.log(c.gray('  Using npx whygit. Add --local to point at an installed binary instead.'));
  console.log('');
  return 0;
}
