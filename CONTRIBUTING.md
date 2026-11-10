# Contributing to whygit

Thanks for taking the time to help. whygit is small on purpose: no runtime
dependencies, no network calls, no LLM. Keep it that way and changes stay easy
to review.

## Setup

```bash
git clone https://github.com/carefreebit/whygit
cd whygit
npm test          # node:test, no install step needed
npm run lint      # house style: no CRLF, no tabs, no stray console.log
```

Node 22.5+ is required (that is when `node:sqlite` shipped).

## Trying a change against real history

```bash
git clone --bare https://github.com/psf/requests /tmp/requests.git
git clone /tmp/requests.git /tmp/requests
cd /tmp/requests
node /path/to/whygit/bin/whygit.js why "cookie jar"
```

Every command also accepts `--json`, which is the easiest way to inspect what
the ranker actually returned.

## Good first contributions

- **Signal quality.** If a rationale looks wrong on your repository, open an issue
  with the commit sha and the sentence. `src/signals.js` is where the extraction
  rules live, and every rule there is one line of regex plus a comment.
- **Language support.** The causal markers are English and Chinese today; adding
  Spanish, German, Japanese or Korean markers is a contained change.
- **Ranking.** `src/search.js` reranks FTS hits. Small weight changes are easy to
  argue about with a before/after table.
- **MCP clients.** `src/install.js` knows Claude Code, Cursor, VS Code and AGENTS.md.
  Another editor is a small adapter.

## Pull requests

- One idea per PR, with the command you ran and the output you expected.
- Keep the diff small; new dependencies need a very good reason.
- `npm test` and `npm run lint` must pass. CI runs both on Node 22 and 24.

## Reporting a bad explanation

The most useful bug report looks like this:

```
repo:    psf/requests
command: whygit why "retry"
got:     <the line you think is wrong>
expect:  <the decision you know is the real reason, with a commit sha if you have it>
```

That is enough to turn a vague ranking complaint into a regression test.

## Code of conduct

Be decent. Assume the other person is tired and acting in good faith.
