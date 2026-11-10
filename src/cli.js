/** whygit command line. */
import process from 'node:process';
import { c, width } from './util.js';
import { cmdWhy } from './cmd-why.js';
import { cmdStory } from './cmd-story.js';
import { cmdCursed } from './cmd-cursed.js';
import { cmdCheck } from './cmd-check.js';
import { cmdInit, cmdDoctor, cmdStatus } from './cmd-init.js';
import { cmdMcp } from './mcp.js';
import { cmdInstall } from './install.js';
import { loadContext, repoLabel } from './context.js';
import { buildWhylog, writeWhylog } from './whylog.js';
import { header } from './ui.js';

const VERSION = '0.1.0';

const HELP = [
  '',
  '  ' + c.bold(c.cyan('whygit')) + c.gray('  git blame tells you who. whygit tells you why.'),
  '',
  c.bold('  USAGE'),
  '    whygit <command> [options]',
  '',
  c.bold('  QUESTIONS'),
  '    whygit why <words...>        search history for the reason behind a decision',
  '    whygit why <file>:<line>     explain one line: who wrote it and why',
  '    whygit story <file>          narrate one file from birth to HEAD',
  '    whygit cursed                rank files by churn x fixes x authors',
  '',
  c.bold('  ARTIFACTS'),
  '    whygit whylog [--write]      print or write WHYLOG.md',
  '    whygit check [--base ref]    explanation coverage for a change set (CI gate)',
  '',
  c.bold('  AGENTS'),
  '    whygit mcp                   run the MCP server on stdio',
  '    whygit install [agent]       wire into claude / cursor / vscode / agents',
  '',
  c.bold('  HOUSEKEEPING'),
  '    whygit init [--full]         build or refresh the index',
  '    whygit doctor                diagnose the setup',
  '    whygit status                what is indexed',
  '',
  c.bold('  OPTIONS'),
  '    --json                       machine-readable output',
  '    -n, --limit <n>              number of results',
  '    --cwd <dir>                  run against another repository',
  '    --base <ref>                 base for check (default origin/HEAD)',
  '    --min <0..1>                 check threshold (default 0.5)',
  '    --full                       reindex everything',
  '    --local                      install: use the whygit binary, not npx',
  '    -v, --version                print version',
  '',
  c.gray('  Every command accepts --json. Nothing leaves your machine.'),
  '',
].join('\n');

export function parseArgs(argv) {
  const flags = {};
  const args = [];
  let i = 0;
  while (i < argv.length) {
    const a = argv[i];
    if (a === '--') { args.push.apply(args, argv.slice(i + 1)); break; }
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      const key = eq > 0 ? a.slice(2, eq) : a.slice(2);
      let val = eq > 0 ? a.slice(eq + 1) : null;
      if (val == null && i + 1 < argv.length && !argv[i + 1].startsWith('-')) {
        const maybe = argv[i + 1];
        if (['json','full','local','quiet','write','help','version','no-color','all'].includes(key)) val = true;
        else { val = maybe; i += 1; }
      }
      flags[key] = val == null ? true : val;
      i += 1;
      continue;
    }
    if (a === '-n' || a === '-q' || a === '-v' || a === '-h') {
      if (a === '-n') { flags.limit = argv[i + 1]; i += 2; continue; }
      if (a === '-q') { flags.quiet = true; i += 1; continue; }
      if (a === '-v') { flags.version = true; i += 1; continue; }
      if (a === '-h') { flags.help = true; i += 1; continue; }
    }
    args.push(a);
    i += 1;
  }
  return { args: args, flags: flags };
}

function cmdWhylog(args, flags) {
  const ctx = loadContext({ cwd: flags.cwd });
  const label = repoLabel(ctx);
  if (flags.write) {
    const res = writeWhylog(ctx, { label: label, limit: Number(flags.limit) || 40 });
    console.log('');
    console.log('  ' + c.green('\u2713') + ' wrote ' + c.bold(res.file) + c.gray('  (' + res.decisions + ' decisions, ' + Math.round(res.bytes / 1024) + ' KB)'));
    console.log('');
    return 0;
  }
  process.stdout.write(buildWhylog(ctx, { label: label, limit: Number(flags.limit) || 40 }));
  return 0;
}

export async function main(argv) {
  const parsed = parseArgs(argv);
  const flags = parsed.flags;
  const args = parsed.args;
  if (flags.version) { console.log(VERSION); return 0; }
  if (flags.help) { console.log(HELP); return 0; }
  const cmd = args[0];
  const rest = args.slice(1);
  if (flags['no-color']) process.env.NO_COLOR = '1';
  switch (cmd) {
    case undefined:
      try { return cmdStatus([], flags); } catch (err) { console.log(HELP); return 0; }
    case 'why': return cmdWhy(rest, flags);
    case 'story': return cmdStory(rest, flags);
    case 'cursed': return cmdCursed(rest, flags);
    case 'whylog': return cmdWhylog(rest, flags);
    case 'check': return cmdCheck(rest, flags);
    case 'init': return cmdInit(rest, flags);
    case 'doctor': return cmdDoctor(rest, flags);
    case 'status': return cmdStatus(rest, flags);
    case 'mcp': return cmdMcp(rest, flags);
    case 'install': return cmdInstall(rest, flags);
    case 'help': console.log(HELP); return 0;
    case 'version': console.log(VERSION); return 0;
    default:
      console.error('whygit: unknown command ' + JSON.stringify(cmd));
      console.log(HELP);
      return 2;
  }
}
