<!--
SPDX-FileCopyrightText: 2026 Agonist Development AB
SPDX-License-Identifier: Apache-2.0
-->

# Changelog

Notable changes to `@governancer-foundation/funnel-base-mcp`, newest first. Versions follow
[Semantic Versioning](https://semver.org/); before 1.0 a minor version may add,
and does not break.

## 0.1.1 — 2026-08-10

### Fixed

- The ledger cross-check no longer reports an article as validated when only one
  of its sub-paragraphs is. It was a substring test, so `Art. 50` matched inside
  `Art. 50(2)` — a different provision — and the tool tells its reader that a
  mentioned citation has been checked.
- Three citation patterns that had never matched anything: the spelled-out
  article form, a US Code section with a letter suffix, and California code
  sections, whose pattern could not fire at all.
- The version the server reports to a client is now held to the manifest by a
  test, rather than by remembering to change two places.

## 0.1.0 — 2026-06-18

First public release. A read-only server exposing validated primary-source
statutory text and a citation validation ledger. Bring your own corpus.
