<!-- SPDX-FileCopyrightText: 2026 Agonist Development AB -->
<!-- SPDX-License-Identifier: CC-BY-4.0 -->

# Security Policy

## Reporting a vulnerability

**Do not report security issues via public GitHub issues.**

Email **security@governancer.com** _(to-confirm: this mailbox must be provisioned and monitored before first public release)_ with:

1. Affected version(s) of `@governancer/funnel-base-mcp`
2. Reproduction steps
3. Impact assessment (severity, exploitability)
4. Optional: suggested fix or patch

If you prefer encrypted communication, request our PGP key in the first email and we will send it from the same address.

## Threat model (what this server is)

`@governancer/funnel-base-mcp` is a **read-only MCP stdio server**. It:

- makes **no network calls** (no LLM calls, no internet egress);
- **never writes** to the corpus or anywhere else;
- is reachable **only** by the local process that spawns it over stdio — there is
  no HTTP listener and no public attack surface.

The most relevant classes of issue are therefore: **path traversal** in
`read_funnel_file` (reading files outside `FUNNEL_BASE_ROOT`), denial-of-service
via crafted corpus input, and dependency vulnerabilities. Reports in these areas
are especially valuable.

## Response targets

| Event | Target |
|---|---|
| Acknowledge receipt | within 72 hours |
| Initial assessment | within 7 days |
| Patch for HIGH/CRITICAL | within 14 days of confirmation |
| Patch for MEDIUM/LOW | within 30 days of confirmation |
| Coordinated disclosure | by mutual agreement, default 90 days |

## Supported versions

Until v1.0.0 we provide security patches for the **latest minor release on `main`** only. After v1.0.0 we will support the two most recent minor releases.

| Version | Supported |
|---|---|
| `0.x` | Latest minor only |
| `1.x` (when released) | Latest two minors |

## Disclosure

We will:

- Credit the reporter (with their consent) in the release notes and GitHub Security Advisory
- Publish a CVE via the GitHub Security Advisory database for HIGH/CRITICAL findings
- Notify users via the npm package security alerts mechanism

## Out of scope

- Vulnerabilities in third-party dependencies — please report to the upstream
  project. We track these via Dependabot and ship patches when upstream releases.
- Issues in any **corpus** you load via `FUNNEL_BASE_ROOT` — the corpus is your
  data, not part of this package, and is out of scope for this server's security
  policy.

## Bug bounty

We do not currently offer a paid bug bounty. Acknowledgement and credit are provided for all valid reports.
