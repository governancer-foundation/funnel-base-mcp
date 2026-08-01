# @governancer-foundation/funnel-base-mcp

[![CI](https://github.com/governancer-foundation/funnel-base-mcp/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/governancer-foundation/funnel-base-mcp/actions/workflows/ci.yml)
[![OpenSSF Scorecard](https://api.securityscorecards.dev/projects/github.com/governancer-foundation/funnel-base-mcp/badge)](https://scorecard.dev/viewer/?uri=github.com/governancer-foundation/funnel-base-mcp)
[![gitleaks](https://github.com/governancer-foundation/funnel-base-mcp/actions/workflows/gitleaks.yml/badge.svg?branch=main)](https://github.com/governancer-foundation/funnel-base-mcp/actions/workflows/gitleaks.yml)
[![REUSE compliant](https://img.shields.io/badge/REUSE-compliant-brightgreen.svg)](https://api.reuse.software/info/github.com/governancer-foundation/funnel-base-mcp)
[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](./LICENSE)
[![npm version](https://img.shields.io/npm/v/@governancer-foundation/funnel-base-mcp.svg)](https://www.npmjs.com/package/@governancer-foundation/funnel-base-mcp)

> Fetch *verbatim* law text and cross-check statutory citations at write time — a stdio MCP server, zero network egress, you bring your own corpus.

A small, read-only **MCP (Model Context Protocol) server** that exposes a corpus of validated primary-source **statutory text** — plus a citation **validation ledger** — as queryable resources and tools for Claude Code sessions and CI agents.

It exists so an AI coding session can fetch *verbatim* law text and cross-check statutory citations **at write time**, instead of paraphrasing regulations from training data and discovering the error later. The server is a thin loader over a corpus directory you provide; it makes no network calls and never writes to the corpus.

> **Note on the corpus.** This package ships the *server code* only (Apache-2.0). It does **not** ship a corpus. You point it at your own corpus directory via the `FUNNEL_BASE_ROOT` environment variable. Without a corpus the tools simply report "nothing found". See **License** below.

## What it exposes

### Resources (`uri` → markdown)

- `funnel-base://VALIDATION-SUMMARY` — the citation validation ledger (the consolidated set of corrections found during a primary-source validation pass).
- `funnel-base://law-texts/<slug>` — the per-statute bundle (`source.md` + `text-extracts.md` + `validation.md`).

### Tools

- `list_law_texts` — coverage status for every law-text slug in the corpus.
- `get_statute(slug)` — verbatim primary statutory text + validation status for one slug.
- `validate_citation(text)` — scan a markdown chunk for statutory citations and cross-check them against the validation ledger.
- `read_funnel_file(path)` — read a single file under the corpus root (path-traversal protected).
- `list_funnel_files` — discover the available corpus markdown files.

## Corpus layout

The loader reads (all parts optional):

```
<FUNNEL_BASE_ROOT>/
├── 01-acts/*.md        # per-act analysis (optional)
├── 02-verticals/*.md   # per-vertical analysis (optional)
└── law-texts/
    ├── VALIDATION-SUMMARY.md
    └── <slug>/
        ├── source.md          # metadata + fetch status
        ├── text-extracts.md   # verbatim primary statutory text
        └── validation.md      # per-claim validation status
```

## Install

```bash
npm install -g @governancer/funnel-base-mcp
```

Or run it without installing:

```bash
FUNNEL_BASE_ROOT=/path/to/your/corpus npx @governancer/funnel-base-mcp
```

To work on the server itself, build from source instead:

```bash
npm install
npm run build
```

Wire it into Claude Code via `.mcp.json`, pointing `FUNNEL_BASE_ROOT` at your corpus:

```json
{
  "mcpServers": {
    "funnel-base": {
      "command": "node",
      "args": ["./node_modules/@governancer-foundation/funnel-base-mcp/dist/index.js"],
      "env": {
        "FUNNEL_BASE_ROOT": "/path/to/your/funnel-base"
      }
    }
  }
}
```

The server speaks the MCP **stdio** transport — no HTTP endpoint, no public attack surface. Only a process that spawns it (Claude Code, a CI script) can talk to it.

## Typical usage

- When editing any compliance/PRD/vertical markdown, call `validate_citation` on the proposed text **before** committing.
- When a specific statute is in play, call `get_statute(slug)` to read verbatim primary text rather than paraphrasing.

## Tests

```bash
npm test          # vitest, one pass
npm run test:watch
npm run typecheck # source and specs
```

The suite runs on a synthetic corpus built in a temp directory, so it needs no
corpus of its own. It covers the citation scanner per jurisdiction, the loader's
filesystem behaviour including path-traversal refusal, and the MCP surface
end-to-end — a real client driving a real server over an in-memory transport.
Continuous integration additionally smoke-tests the built binary over stdio.

## What this server explicitly does NOT do

- ❌ Write to the corpus — citation corrections happen via human-attested PR review, not via the agent.
- ❌ Call any external API (no LLM calls, no internet egress).
- ❌ Persist state — stateless reads only.

## License

**Server code: Apache-2.0** (see [`LICENSE`](./LICENSE) + [`NOTICE`](./NOTICE)).

Any corpus you load via `FUNNEL_BASE_ROOT` is **yours** and is not part of this package — it is neither shipped nor licensed here. The server is a replaceable loader; a real, attested corpus is what makes the tools meaningful.

---

Maintained by **Alexander Brichkin (Agonist Development AB)** under the `governancer-foundation` open-source commons.
