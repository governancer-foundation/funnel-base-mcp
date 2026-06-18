<!-- SPDX-FileCopyrightText: 2026 Agonist Development AB -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# Contributing to `@governancer/funnel-base-mcp`

Thanks for your interest in contributing! This is a single npm/TypeScript
package — an **MCP (Model Context Protocol — the open JSON-RPC tool/resource
protocol that lets AI coding assistants call external servers) stdio server**.
This document describes how to set it up, our coding conventions, and the
pull-request process.

By participating, you agree to abide by our
[Code of Conduct](./CODE_OF_CONDUCT.md).

---

## Table of contents

- [Getting started](#getting-started)
- [Development workflow](#development-workflow)
- [Code style](#code-style)
- [Commit format](#commit-format)
- [Pull-request process](#pull-request-process)
- [Developer Certificate of Origin (DCO)](#developer-certificate-of-origin-dco)
- [Reporting bugs / requesting features](#reporting-bugs--requesting-features)

---

## Getting started

### Prerequisites

- **Node.js** `>=20` (use `nvm install` if you keep an `.nvmrc`).
- **npm** `>=10` (ships with Node 20+). This package uses **npm + `tsc`** — it
  is **not** a pnpm/turbo workspace.
- **Git** `>=2.40`.

### One-time setup

```sh
git clone https://github.com/governancer-foundation/funnel-base-mcp.git
cd funnel-base-mcp
npm ci          # reproducible install from package-lock.json
npm run build   # compiles src/*.ts → dist/ via tsc
```

### Verifying your setup

```sh
npm run build          # tsc — must emit dist/ cleanly
npx tsc --noEmit       # strict typecheck (no emit)
```

If both are green, you're ready to contribute. There is **no unit-test runner
configured yet** — the typecheck (`tsc --noEmit`) is the current correctness
gate. Do **not** add a test framework as part of an unrelated change; propose it
in a dedicated PR first (see [feature requests](#reporting-bugs--requesting-features)).

---

## Development workflow

```sh
npm run build      # one-shot compile (tsc)
npm run watch      # incremental recompile on change (tsc --watch)
npm run dev        # run the server straight from src/ via tsx (no build step)
npm start          # run the compiled server (node dist/index.js)
```

### Trying the server locally

The server speaks the MCP **stdio** transport — there is no HTTP endpoint. Point
it at a corpus directory through the `FUNNEL_BASE_ROOT` environment variable and
spawn it from an MCP client (Claude Code, a CI script):

```jsonc
// .mcp.json
{
  "mcpServers": {
    "funnel-base": {
      "command": "node",
      "args": ["./dist/index.js"],
      "env": { "FUNNEL_BASE_ROOT": "/path/to/your/funnel-base" }
    }
  }
}
```

The package ships the **server code only** — it does not ship a corpus. See the
`README.md` "License" section for the code/corpus boundary.

### Adding a dependency

```sh
npm install some-pkg          # runtime dependency
npm install -D some-dev-pkg   # dev dependency
```

Keep the runtime dependency surface small — this is a thin, read-only loader.
Commit the resulting `package-lock.json` change in the same PR.

---

## Code style

- **TypeScript-first.** All source is TS, ESM-only (`"type": "module"`), compiled
  with the strict profile in `tsconfig.json`.
- **No `any`.** Prefer `unknown` plus a narrow type guard, or
  [`zod`](https://zod.dev) (already a dependency) for genuinely dynamic shapes.
- **Type-only imports** must use `import type`.
- **No network egress, no writes.** The server is read-only and makes no network
  calls. A PR that adds either will be rejected unless the change is the explicit
  point of the PR and has been agreed in an issue first.
- **SPDX headers.** Every new `.ts` source file starts with:

  ```ts
  // SPDX-License-Identifier: Apache-2.0
  // SPDX-FileCopyrightText: 2026 Agonist Development AB
  ```

  (In `src/index.ts` the `#!/usr/bin/env node` shebang stays on line 1, with the
  SPDX lines immediately after.)

---

## Commit format

We follow [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/).

### Allowed types

| Type       | Use for                                                  |
|------------|----------------------------------------------------------|
| `feat`     | New user-facing feature                                  |
| `fix`      | Bug fix                                                  |
| `docs`     | Docs-only change (README, CONTRIBUTING, etc.)            |
| `chore`    | Tooling, deps, build config — no source-behavior change  |
| `refactor` | Code change that neither fixes a bug nor adds a feature  |
| `perf`     | Performance improvement                                  |
| `test`     | Tests only                                               |
| `build`    | Build-system / external-deps changes                     |
| `ci`       | CI configuration changes                                 |
| `style`    | Formatting / whitespace / lint-only fixes                |
| `revert`   | Reverts a previous commit                                |

### Examples

```
feat(tools): add list_funnel_files corpus discovery tool
fix(loader): reject path-traversal in read_funnel_file
docs: clarify FUNNEL_BASE_ROOT setup in README
chore(deps): bump @modelcontextprotocol/sdk to 1.1.0
ci: pin scorecard-action by commit SHA
```

---

## Pull-request process

1. **Fork** the repo and create a feature branch:
   `feat/short-description` or `fix/short-description`.
2. Make your changes in small, focused commits. Each commit must build
   (`npm run build`) and typecheck (`npx tsc --noEmit`) cleanly.
3. **Run the local gates:**
   ```sh
   npm ci
   npm run build
   npx tsc --noEmit
   ```
4. **Sign off every commit** (see [DCO](#developer-certificate-of-origin-dco) —
   `git commit -s`).
5. **Open the PR** against `main`. Fill in the PR template, including the DCO
   sign-off checkbox.
6. **CI must be green.** CI runs the build + typecheck plus token-free
   supply-chain checks (CodeQL, OpenSSF Scorecard, dependency review, gitleaks,
   SBOM) and the DCO check.
7. **Get one approving review** from a CODEOWNER
   (`@governancer-foundation/maintainers`).
8. **We squash-merge** by default. The squash subject must be a valid
   Conventional Commit.

---

## Developer Certificate of Origin (DCO)

We use the [Developer Certificate of Origin v1.1](https://developercertificate.org/)
to confirm that contributors have the right to submit their work under the
project's licence (Apache-2.0).

You assert the DCO by adding a `Signed-off-by` line to **every** commit:

```sh
git commit -s -m "feat(tools): add list_funnel_files"
```

This appends:

```
Signed-off-by: Your Name <your.email@example.com>
```

`git config user.email` must match the email you use on GitHub. The DCO CI check
rejects PRs whose commits lack a valid `Signed-off-by` trailer.

> **No AI co-authorship trailers.** Do **not** add `Co-Authored-By: <AI tool>`,
> `Generated with <AI tool>`, or equivalent trailers. AI-assisted contributions
> are welcome but must be disclosed in the PR description (see the PR template),
> not encoded as commit co-authorship.

---

## Reporting bugs / requesting features

- **Bugs:** open a GitHub issue using the
  [Bug report template](.github/ISSUE_TEMPLATE/bug_report.md).
- **Features:** open a GitHub issue using the
  [Feature request template](.github/ISSUE_TEMPLATE/feature_request.md).
- **Security vulnerabilities:** **do not open a public issue.** See
  [SECURITY.md](./SECURITY.md) for our private-disclosure policy.

---

Thanks for contributing to verifiable, citation-checked compliance tooling!
