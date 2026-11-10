<div align="center">

# whygit

**git blame 告诉你「谁」改的。whygit 告诉你「为什么」。**

对着任意仓库跑一次，它把散落在 git 历史里的理由变成可引用的答案：
文件、行号、commit、作者、日期，一个都不少。

[![npm](https://img.shields.io/npm/v/whygit?color=cb3837)](https://www.npmjs.com/package/whygit)
[![tests](https://github.com/whygit/whygit/actions/workflows/ci.yml/badge.svg)](https://github.com/whygit/whygit/actions/workflows/ci.yml)
[![node](https://img.shields.io/badge/node-%3E%3D22.5-3c873a)](https://nodejs.org)
[![license](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![MCP](https://img.shields.io/badge/MCP-ready-6b46c1)](#交给你的-agent)

[English](README.md) · [快速开始](#快速开始) · [命令](#命令) · [Agent 接入](#交给你的-agent) · [原理](#它是怎么做到的)

</div>

---

```console
$ whygit why "cookie jar"

  whygit  psf/requests  4,884 commits
  ────────────────────────────────────

   1. Copy a PreparedRequest's CookieJar reliably
    2015-04-06 · 36093e69 · Ian Cordasco · change · 100% match

    By adding _copy_cookie_jar we can reliably copy cookie jars so that we have an
    actual copy instead of the same instance on different prepared requests.

    requests/cookies.py  requests/models.py
    → https://github.com/psf/requests/commit/36093e69c70b9b24dd1e007befa35ad891313f51
```

这个答案一直躺在仓库里——2015 年某次 commit 的正文，此后九年没人读过。
whygit 用 21 毫秒把它找出来：没有大模型，没有 API key，没有网络请求。

## 它解决什么问题

每个代码库里都有一批「看起来很蠢、其实很关键」的代码：
一次显得多余的重试、一个看起来神经质的判空、一句像偷懒的 `sleep(2)`。

- `git blame` 只回答**谁**、**什么时候**动了这一行，不回答为什么；
- `git log` 是个只写不读的数据库，理由埋在 2016 年某条 commit 正文里；
- 让大模型去总结 git 历史，它会**编出看起来合理的理由**。在代码库里，一个听起来对的错理由，比没有理由更危险；
- 编码 Agent 受害最深：它们删掉重试、改写判空，半年后同一个 bug 回来——因为没有任何东西告诉它「这行是承重的」。

whygit 只做一件事：把仓库**已经写下的**理由读出来，提取真正在解释决策的句子，
送到两个真正有用的地方——**你的终端**，和 **Agent 的上下文窗口**。

## 快速开始

```bash
npx whygit init                     # 扫一遍历史，5k commit 约 2 秒
npx whygit why "retry on 503"       # 用自然语言问
npx whygit why src/client.js:42     # 这一行到底为什么在这里
npx whygit cursed                   # 反复出问题的文件排行
npx whygit story src/client.js      # 单个文件从诞生到 HEAD 的一生
npx whygit whylog --write           # 生成 WHYLOG.md，给 Agent 读的历史笔记
```

需要 **Node 22.5+**（用到内置的 `node:sqlite`）。零运行时依赖，无配置文件，
无账号，无遥测。

第一次运行会在 `.git/whygit/index.db` 建本地索引；之后每次都是增量更新，
新 commit 会被自动补进来。

## 命令

| 命令 | 回答什么 |
| --- | --- |
| `whygit why <关键词>` | 这个行为为什么存在？按相关度排序，每条都带出处。 |
| `whygit why <文件>:<行号>` | 这一行为什么还活着？blame + 背后的决策 + 这次改动还剩多少行在 HEAD。 |
| `whygit story <文件>` | 一个文件的传记：出生、按年提交量、关键章节、谁一直在维护它。 |
| `whygit cursed` | 风险地图：改动量 × 修复密度 × 作者分散度 × 新鲜度。重构前先看。 |
| `whygit whylog --write` | 生成 `WHYLOG.md`：承重决策 + 高危文件，纯 Markdown。 |
| `whygit check --base origin/main` | CI 门禁：新增代码行里，有多大比例能追溯到「说过为什么」的 commit。 |
| `whygit mcp` | 基于 stdio 的 MCP 服务，Claude Code、Cursor、Codex 及任何 MCP 客户端可用。 |
| `whygit install <agent>` | 写入 MCP 配置（`claude` / `cursor` / `vscode` / `agents` / `all`）。 |
| `whygit doctor` | 自检：git、索引是否过期、是否浅克隆、WHYLOG 是否缺失。 |

所有命令都支持 `--json`（给脚本用）和 `--cwd <path>`（指向别的仓库）。

### `why <文件>:<行号>`

```console
$ whygit why src/requests/models.py:120

   1. basics working
    2012-12-15 · 366e8e84 · Kenneth Reitz · change
    line 120 is 78 lines of this change, still in HEAD

   2. Add hasattr checks for remaining protocol isinstance checks (#7505)
    2026-06-09 · 6f66281a · change
```

这一行本身平平无奇。真正重要的是：它周围 78 行仍然来自 2012 年那次改动——
也就是说，这里的结构是承重的，不是随手写的。

### `story <文件>`

```console
$ whygit story src/requests/models.py

  born 2011-05-14 · package refactor

    2011  ██████████████████████████████████······  217
    2012  ████████████████████████████████████████  254
    2013  ██████████████··························   86
    ...

  717 commits · 202 authors · 154 fixes · 0 TODO markers
  ─── the plot ──────────────────────────────────────────────────

  2015-04-06  Copy a PreparedRequest's CookieJar reliably
            By adding _copy_cookie_jar we can reliably copy cookie jars so that we
            have an actual copy instead of the same instance on different prepared
            requests.
```

### `cursed`

```console
$ whygit cursed

   1  src/requests/models.py          ██████████████    8.1  717 commits · 202 authors · 154 fixes
   2  src/requests/sessions.py        █████████████·    7.5  334 commits · 110 authors · 79 fixes
   3  tests/test_requests.py          ████████████··    7.2  366 commits · 104 authors · 76 fixes
```

这不是代码质量评分，而是一张地图：标出历史密度最高的地方——在那里自信地重写，
大概率是错的。

## 交给你的 Agent

不知道历史的 Agent 会重写承重代码；知道历史的 Agent 会先问对问题。一条命令接好：

```bash
npx whygit install claude     # .mcp.json
npx whygit install cursor     # .cursor/mcp.json
npx whygit install vscode     # .vscode/mcp.json
npx whygit install agents     # 往 AGENTS.md 追加一段（任何 Agent 都认）
npx whygit install all
```

如果 `whygit` 已在 `PATH` 里，加 `--local`（否则配置里用 `npx -y whygit@latest`）。

MCP 服务暴露五个工具：

| 工具 | 什么时候用 |
| --- | --- |
| `why_search` | Agent 即将改动一段它并不理解的行为。 |
| `why_line` | Agent 正在编辑某一行，需要这行背后的决策。 |
| `why_file` | Agent 要重构一个文件，需要塑造过它的全部决策。 |
| `why_risk` | Agent 在挑起点，或者在挑「别碰哪里」。 |
| `whylog_read` | Agent 想一口气读完蒸馏后的历史。 |

在 Agent 的指令文件里加一行，行为就变了：

```markdown
改动任何你不理解的行之前，先调用 `why_line`（MCP：whygit）。
如果历史决策和你的方案冲突，先说出来，再动手。
```

### WHYLOG.md —— Agent 不用被提醒就会读的历史

`whygit whylog --write` 生成一份 Markdown：小到可以进仓库，具体到能改变一次决策。

- **承重决策**：按重要性排序，每条都带原文理由、日期、commit、作者、涉及文件；
- **高危文件**：历史最稠密的地方；
- **仓库规矩**：一行约定（`WHY: ...`），让以后的 commit 自己解释自己。

它由 git 生成、永不手改、在 review 里 diff 干净。提交进仓库后，
每个在这个仓库里启动的 Agent 都免费获得上下文——**不需要 MCP**。

### CI 门禁

```yaml
- run: npx whygit check --base origin/main --min 0.6
```

当新增代码行中能追溯到「说过理由」的 commit 的比例低于 60% 时失败。
它不是 linter，只是提醒：修复方式是在 commit 正文里写一句话。

## 它是怎么做到的

```text
git log（两遍：元数据 + numstat）
        │
        ▼
  信号提取：去掉 trailer、过滤机器人噪音、去重 squash-merge 重复标题，
           保留含因果词的句子（because / so that / to avoid / 由于 / 避免 / 回滚 ...）
        │
        ▼
  SQLite  .git/whygit/index.db   commits · files · decisions · FTS5 · risk
        │
        ▼
  排序：BM25 × 置信度 × 改动量 × 新鲜度 × 修复密度 × 噪音惩罚
        │
        ├── whygit why / story / cursed        （终端）
        ├── whygit whylog                      （WHYLOG.md）
        └── whygit mcp                         （Agent）
```

**什么叫一条「决策」**：commit message 里存在解释选择的句子。
whygit 不解释这句话，只引用它。如果 message 什么都没说，这条决策置信度就低，
排在说过理由的后面。

**为什么快**：整个索引只来自两遍 `git log`，查询在同一个进程里打 FTS5。
在普通笔记本上，4,884 个 commit 建索引约 3 秒，单次查询约 20 毫秒。
没有网络、没有模型、没有缓存要预热。

**它不会做什么**：编理由、总结代码、评判质量。历史沉默时，whygit 就说沉默——
沉默本身也是一种结论。

## 和其他方案比

| | 回答「为什么」 | 给出处 | 可离线 | 为 Agent 而生 |
| --- | :---: | :---: | :---: | :---: |
| `git blame` | 否 | — | 是 | 否 |
| `git log` | 只有你已经知道去哪找时 | 是 | 是 | 否 |
| 大模型生成的文档 | 有时 | 很少 | 否 | 部分 |
| **whygit** | **是** | **是（sha + 文件 + 行）** | **是** | **是（MCP + WHYLOG.md）** |

## 常见问题

**会把我的代码传到网上吗？** 不会。whygit 只读本地 git 数据，只往 `.git/` 里写一个 SQLite 文件，
代码里没有任何网络调用路径。

**需要大模型吗？** 不需要，这正是重点：一句 2016 年带出处的原话，胜过模型的自信转述。

**浅克隆能用吗？** 能跑，但会明确告诉你历史被截断了（`whygit doctor`）。结果只和现存历史一样好。

**squash merge 呢？** 已处理：去掉正文里重复的标题行，把 PR 描述当作理由。

**monorepo？** 支持。路径按原样索引，`why <文件>:<行号>` 在任意层级都可用。

**会改我的仓库吗？** 只在你明确要求时：`whylog --write`、`install`，以及 `.git/` 下的索引。
历史始终只读。

## 局限

- 理由的上限就是 commit message 的质量。whygit 让沉默可见，但没法替你补上；
- 超大历史（50 万+ commit）建索引是分钟级，不是秒级；
- 重命名按路径追踪，不做内容相似度匹配：一个文件搬过两次，可能有两段历史；
- 排序是启发式的，偏向「有出处的理由」而不是改动量，仍会出错——每条结果都带引用，方便你自己核对。

## 参与贡献

```bash
git clone https://github.com/whygit/whygit && cd whygit
npm test          # 17 个测试，不联网
npm run lint
node bin/whygit.js why "..." --cwd /path/to/any/repo
```

欢迎 issue 和 PR——尤其是真实的排序失败案例。请附上查询、仓库，以及你认为本应排第一的结果。

## 许可证

MIT，见 [LICENSE](LICENSE)。

---

<div align="center">

如果 whygit 帮你拦下了一次「删掉承重代码」的操作，点个 star，能让下一个人找到它。

**[⭐ Star whygit](https://github.com/whygit/whygit)**

</div>
