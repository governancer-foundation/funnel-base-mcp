---
name: Bug report
description: Report a bug in the funnel-base MCP server
title: 'bug: '
labels: ['bug', 'triage']
---

<!--
Thanks for reporting! Please fill in as much detail as you can.
For security vulnerabilities, DO NOT use this form — see SECURITY.md
(private disclosure to security@governancer.com).
-->

## Version

<!-- `npm ls @governancer/funnel-base-mcp` output, or the commit SHA you built from -->

## What happened?

<!-- One paragraph: what you expected vs what occurred. -->

## Reproduction steps

<!-- Numbered steps. -->

1.
2.
3.

## MCP client + corpus

<!--
Which MCP client spawned the server (e.g. Claude Code, a CI script)?
Did you set FUNNEL_BASE_ROOT, and does the corpus follow the expected layout
(law-texts/<slug>/...)? Do NOT paste any confidential corpus contents.
-->

- MCP client:
- `FUNNEL_BASE_ROOT` set: yes / no
- Which tool/resource was called (e.g. `get_statute`, `validate_citation`,
  `funnel-base://law-texts/<slug>`):

## Environment

<!-- Output of: node -v && npm -v && uname -a -->

```text

```

## Logs / error output

<!-- stderr from the server process. Redact anything sensitive. -->

```text

```
