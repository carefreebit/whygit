/** Small, dependency-free helpers shared across whygit. */

const isTTY = Boolean(process.stdout.isTTY);
const noColor = 'NO_COLOR' in process.env || process.env.TERM === 'dumb';
const useColor = isTTY && !noColor;

function wrap(code) {
  return function (s) {
    if (!useColor) return String(s);
    return '\x1b[' + code + 'm' + s + '\x1b[0m';
  };
}

export const c = {
  dim: wrap('2'),
  bold: wrap('1'),
  italic: wrap('3'),
  underline: wrap('4'),
  red: wrap('31'),
  green: wrap('32'),
  yellow: wrap('33'),
  blue: wrap('34'),
  magenta: wrap('35'),
  cyan: wrap('36'),
  gray: wrap('90'),
  white: wrap('97'),
};

export const supportsColor = useColor;

const ANSI_RE = /\x1b\[[0-9;]*m/g;

export function stripAnsi(s) {
  return String(s).replace(ANSI_RE, '');
}

/** Display width that treats CJK / wide characters as two columns. */
export function width(s) {
  const str = stripAnsi(s);
  let w = 0;
  for (const ch of str) {
    const cp = ch.codePointAt(0);
    if (cp === 0x200b || (cp >= 0x0300 && cp <= 0x036f)) continue;
    if (
      (cp >= 0x1100 && cp <= 0x115f) ||
      (cp >= 0x2e80 && cp <= 0xa4cf) ||
      (cp >= 0xac00 && cp <= 0xd7a3) ||
      (cp >= 0xf900 && cp <= 0xfaff) ||
      (cp >= 0xfe30 && cp <= 0xfe6f) ||
      (cp >= 0xff00 && cp <= 0xff60) ||
      (cp >= 0xffe0 && cp <= 0xffe6) ||
      (cp >= 0x1f300 && cp <= 0x1f64f) ||
      (cp >= 0x1f900 && cp <= 0x1f9ff) ||
      (cp >= 0x20000 && cp <= 0x3fffd)
    ) {
      w += 2;
    } else {
      w += 1;
    }
  }
  return w;
}

export function padEnd(s, n) {
  const d = n - width(s);
  return d > 0 ? String(s) + ' '.repeat(d) : String(s);
}

export function padStart(s, n) {
  const d = n - width(s);
  return d > 0 ? ' '.repeat(d) + String(s) : String(s);
}

export function truncate(s, max) {
  const str = String(s);
  if (width(str) <= max) return str;
  let out = '';
  let w = 0;
  for (const ch of str) {
    const cw = width(ch);
    if (w + cw > max - 1) break;
    out += ch;
    w += cw;
  }
  return out + '\u2026';
}

export function wrapText(s, maxWidth, indent) {
  const pre = indent || '';
  const words = String(s).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const w of words) {
    if (line && width(line + ' ' + w) > maxWidth) {
      lines.push(pre + line);
      line = w;
    } else {
      line = line ? line + ' ' + w : w;
    }
  }
  if (line) lines.push(pre + line);
  return lines.length ? lines : [pre];
}

export function plural(n, one, many) {
  return n + ' ' + (n === 1 ? one : many || one + 's');
}

export function isoDate(ts) {
  if (!ts) return '';
  const d = new Date(Number(ts) * 1000);
  return d.toISOString().slice(0, 10);
}

export function relativeTime(ts, now) {
  const t = Number(ts) * 1000;
  const diff = (now || Date.now()) - t;
  const sec = Math.round(diff / 1000);
  if (sec < 60) return 'just now';
  const min = Math.round(sec / 60);
  if (min < 60) return min + 'm ago';
  const hr = Math.round(min / 60);
  if (hr < 24) return hr + 'h ago';
  const day = Math.round(hr / 24);
  if (day < 30) return day + 'd ago';
  const mo = Math.round(day / 30.44);
  if (mo < 12) return mo + 'mo ago';
  const yr = (day / 365.25).toFixed(1).replace(/\.0$/, '');
  return yr + 'y ago';
}

export function slug(s, max) {
  return String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max || 60);
}

export function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

export function pct(n, d) {
  if (!d) return '0%';
  return Math.round((n / d) * 100) + '%';
}

export function unique(arr) {
  return Array.from(new Set(arr));
}

export function groupBy(arr, key) {
  const map = new Map();
  for (const item of arr) {
    const k = typeof key === 'function' ? key(item) : item[key];
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(item);
  }
  return map;
}

/** Parse 'src/a.js:12' or 'src/a.js:12-20' (Windows drive letters preserved). */
export function parsePathLine(input) {
  const m = String(input).match(/^(.*?):(\d+)(?:-(\d+))?$/);
  if (!m) return { path: String(input), line: null, endLine: null };
  return { path: m[1], line: Number(m[2]), endLine: Number(m[3] || m[2]) };
}

export function jsonOut(value, pretty) {
  return JSON.stringify(value, null, pretty ? 2 : 0);
}

export function warn(msg) {
  process.stderr.write(c.yellow('whygit: ') + msg + '\n');
}

export function die(msg, code) {
  process.stderr.write(c.red('whygit: ') + msg + '\n');
  process.exit(code == null ? 1 : code);
}

export function log(msg) {
  process.stdout.write(msg + '\n');
}

export function isBinaryName(p) {
  return /\.(png|jpe?g|gif|webp|ico|bmp|pdf|zip|gz|tgz|bz2|xz|7z|rar|jar|war|class|exe|dll|so|dylib|bin|woff2?|ttf|otf|eot|mp3|mp4|mov|avi|webm|wav|flac|sqlite|db|pyc|o|a|lib|node)$/i.test(p);
}

export const CODE_EXT = new Set(['.js','.jsx','.mjs','.cjs','.ts','.tsx','.py','.rb','.go','.rs','.java','.kt','.kts','.scala','.c','.h','.cc','.cpp','.hpp','.cs','.php','.swift','.m','.mm','.sh','.bash','.zsh','.fish','.ps1','.lua','.pl','.r','.jl','.dart','.ex','.exs','.erl','.clj','.cljs','.fs','.vb','.sql','.vue','.svelte','.html','.css','.scss','.sass','.less','.yml','.yaml','.toml','.json','.md','.mdx','.txt','.rst']);

export function extOf(p) {
  const m = String(p).toLowerCase().match(/\.[a-z0-9]+$/);
  return m ? m[0] : '';
}

export function isCodeFile(p) {
  return CODE_EXT.has(extOf(p));
}
