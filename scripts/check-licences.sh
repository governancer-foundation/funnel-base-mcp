#!/usr/bin/env bash
#
# check-licences.sh — refuse a dependency whose licence the project will not take.
#
# The contribution rules name the policy and nothing enforced it. This package
# is imported into other people's compliance paths: a licence obligation
# acquired by accident is one they inherit without being asked, and finding out
# from a customer's legal review is the expensive way.
#
# Denied outright: network-copyleft and source-available terms, which either
# oblige a downstream service operator to publish their source or are not open
# source at all and are blanket-banned in much of enterprise procurement.
#
# Flagged for review, not denied: weak and file-level copyleft. They are usually
# fine for a library that does not modify them, but the decision should be
# deliberate and recorded rather than silent.
#
# Usage:  bash scripts/check-licences.sh [--dev]     (--dev also checks devDependencies)
# Exit:   0 clean · 1 a denied licence · 2 invocation error
#
# SPDX-License-Identifier: Apache-2.0
# SPDX-FileCopyrightText: 2026 Agonist Development AB

set -uo pipefail

DENY='AGPL|SSPL|BUSL|BSL-1\.1|CC-BY-NC|Commons-Clause|Elastic-2\.0|RSAL|PolyForm'
REVIEW='^GPL|^LGPL|^MPL|^EPL|^CDDL|^EUPL'
INCLUDE_DEV=0
[ "${1:-}" = "--dev" ] && INCLUDE_DEV=1

command -v npm >/dev/null || { echo "npm not on PATH" >&2; exit 2; }

# Read each installed package's own manifest. `npm ls --json` omits the licence
# field entirely, which makes it worse than useless here: every entry comes back
# unknown, nothing matches the deny list, and the check passes while seeing
# nothing. A gate that cannot fail is not a gate.
REPORT=$(node -e '
const { readFileSync, readdirSync, existsSync } = require("fs");
const { join } = require("path");
const seen = new Map();
const read = (dir) => {
  const manifest = join(dir, "package.json");
  if (!existsSync(manifest)) return;
  try {
    const p = JSON.parse(readFileSync(manifest, "utf8"));
    if (!p.name || !p.version) return;
    const lic = typeof p.license === "string" ? p.license
      : p.license && p.license.type ? p.license.type
      : Array.isArray(p.licenses) ? p.licenses.map((l) => l.type || l).join(" OR ")
      : "UNKNOWN";
    seen.set(`${p.name}@${p.version}`, lic);
  } catch { /* unreadable manifest is reported as unknown by omission */ }
};
const walk = (root) => {
  if (!existsSync(root)) return;
  for (const entry of readdirSync(root)) {
    if (entry === ".bin") continue;
    const dir = join(root, entry);
    if (entry.startsWith("@")) { for (const scoped of readdirSync(dir)) { read(join(dir, scoped)); walk(join(dir, scoped, "node_modules")); } }
    else { read(dir); walk(join(dir, "node_modules")); }
  }
};
walk("node_modules");
for (const [pkg, lic] of [...seen].sort()) console.log(`${lic}\t${pkg}`);
')

[ -z "$REPORT" ] && { echo "dependency tree resolved to nothing to check."; exit 0; }

TOTAL=$(printf '%s\n' "$REPORT" | grep -c .)
DENIED=$(printf '%s\n' "$REPORT" | grep -Ei "^($DENY)" || true)
FLAGGED=$(printf '%s\n' "$REPORT" | grep -E "$REVIEW" || true)
UNKNOWN=$(printf '%s\n' "$REPORT" | grep -E '^UNKNOWN' || true)

echo "checked $TOTAL resolved dependencies"

if [ -n "$FLAGGED" ]; then
  echo ""
  echo "for review — copyleft terms that are usually fine for a library but should"
  echo "be a recorded decision rather than a silent one:"
  printf '%s\n' "$FLAGGED" | sed 's/^/  /'
fi

if [ -n "$UNKNOWN" ]; then
  echo ""
  echo "no licence declared — read the package before relying on it:"
  printf '%s\n' "$UNKNOWN" | sed 's/^/  /'
fi

if [ -n "$DENIED" ]; then
  echo ""
  echo "DENIED — network-copyleft or source-available terms:" >&2
  printf '%s\n' "$DENIED" | sed 's/^/  /' >&2
  echo "" >&2
  echo "  This package is imported into other people's compliance paths. A licence" >&2
  echo "  obligation acquired here is one they inherit without being asked." >&2
  echo "  Replace the dependency, or change the policy deliberately and say why." >&2
  exit 1
fi

echo ""
echo "no denied licence in the dependency tree."
exit 0
