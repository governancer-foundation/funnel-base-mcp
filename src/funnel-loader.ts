// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Agonist Development AB
/**
 * Loads funnel-base corpus files from disk. All paths are resolved relative to
 * the FUNNEL_BASE_ROOT environment variable (a directory you provide).
 *
 * Expected corpus layout (the parts this loader reads):
 *
 *   <FUNNEL_BASE_ROOT>/
 *   ├── 01-acts/*.md            # per-act analysis (optional)
 *   ├── 02-verticals/*.md       # per-vertical analysis (optional)
 *   └── law-texts/
 *       ├── VALIDATION-SUMMARY.md     # citation validation ledger
 *       └── <slug>/                   # per-statute subdirectory
 *           ├── source.md             # metadata + fetch status
 *           ├── text-extracts.md      # verbatim primary statutory text
 *           └── validation.md         # per-claim validation status
 *
 * This loader is read-only — it never writes to the corpus. Citation
 * corrections happen via PR review with human attestation, not via agent.
 */

import { readFile, readdir, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
// Neutral default: a `funnel-base/` directory next to the installed package.
// In practice you should set FUNNEL_BASE_ROOT to point at your own corpus.
const DEFAULT_FUNNEL_BASE_ROOT = join(HERE, "..", "funnel-base");

export const FUNNEL_BASE_ROOT =
  process.env.FUNNEL_BASE_ROOT ?? DEFAULT_FUNNEL_BASE_ROOT;

export interface LawTextSlugMetadata {
  slug: string;
  hasSource: boolean;
  hasExtracts: boolean;
  hasValidation: boolean;
  /** Coverage status read from source.md fetchStatus, if present */
  fetchStatus?: "fetched-ok" | "partial" | "inaccessible" | "pending";
}

export interface FunnelFile {
  /** Path relative to FUNNEL_BASE_ROOT */
  path: string;
  /** Absolute path on disk */
  absolutePath: string;
  /** Raw file content */
  content: string;
  /** File size in bytes */
  sizeBytes: number;
}

/**
 * Read a funnel-base file by its path relative to FUNNEL_BASE_ROOT.
 * Throws if the path escapes FUNNEL_BASE_ROOT (path traversal protection).
 */
export async function readFunnelFile(relativePath: string): Promise<FunnelFile> {
  const absolutePath = join(FUNNEL_BASE_ROOT, relativePath);
  const safe = relative(FUNNEL_BASE_ROOT, absolutePath);
  if (safe.startsWith("..") || safe.startsWith("/")) {
    throw new Error(
      `Path traversal blocked: ${relativePath} resolves outside FUNNEL_BASE_ROOT`,
    );
  }
  const content = await readFile(absolutePath, "utf8");
  const s = await stat(absolutePath);
  return {
    path: relativePath,
    absolutePath,
    content,
    sizeBytes: s.size,
  };
}

/**
 * List all law-texts subdirectories with coverage metadata.
 * Slug = directory name under law-texts/ (excluding non-directory entries such as VALIDATION-SUMMARY.md).
 */
export async function listLawTextSlugs(): Promise<LawTextSlugMetadata[]> {
  const lawTextsRoot = join(FUNNEL_BASE_ROOT, "law-texts");
  const entries = await readdir(lawTextsRoot, { withFileTypes: true });
  const slugs: LawTextSlugMetadata[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const slug = entry.name;
    const dir = join(lawTextsRoot, slug);
    const subEntries = await safeReaddir(dir);
    const hasSource = subEntries.includes("source.md");
    const hasExtracts = subEntries.includes("text-extracts.md");
    const hasValidation = subEntries.includes("validation.md");

    let fetchStatus: LawTextSlugMetadata["fetchStatus"];
    if (hasSource) {
      try {
        const src = await readFile(join(dir, "source.md"), "utf8");
        if (/fetch[\s-]?status:\s*fetched-ok/i.test(src)) fetchStatus = "fetched-ok";
        else if (/fetch[\s-]?status:\s*partial/i.test(src)) fetchStatus = "partial";
        else if (/fetch[\s-]?status:\s*inaccessible/i.test(src)) fetchStatus = "inaccessible";
        else if (/manual[\s-]?fetch[\s-]?required/i.test(src) || /pending[\s-]?primary[\s-]?fetch/i.test(src))
          fetchStatus = "pending";
      } catch {
        /* swallow */
      }
    }

    slugs.push({ slug, hasSource, hasExtracts, hasValidation, fetchStatus });

    // Recurse one level for nested subdirs (e.g. example-bundle/sub-jurisdiction/)
    for (const subEntry of subEntries) {
      const nested = join(dir, subEntry);
      try {
        const st = await stat(nested);
        if (!st.isDirectory()) continue;
      } catch {
        continue;
      }
      const nestedEntries = await safeReaddir(nested);
      if (nestedEntries.length === 0) continue;
      slugs.push({
        slug: `${slug}/${subEntry}`,
        hasSource: nestedEntries.includes("source.md"),
        hasExtracts: nestedEntries.includes("text-extracts.md"),
        hasValidation: nestedEntries.includes("validation.md"),
      });
    }
  }

  return slugs.sort((a, b) => a.slug.localeCompare(b.slug));
}

async function safeReaddir(dir: string): Promise<string[]> {
  try {
    return await readdir(dir);
  } catch {
    return [];
  }
}

/**
 * Read all three files (source / text-extracts / validation) for a law-texts slug.
 * Missing files are returned as null. Used by the get_statute MCP tool.
 */
export async function readLawTextBundle(slug: string): Promise<{
  slug: string;
  source: string | null;
  textExtracts: string | null;
  validation: string | null;
}> {
  const base = join("law-texts", slug);
  const result = {
    slug,
    source: null as string | null,
    textExtracts: null as string | null,
    validation: null as string | null,
  };
  for (const [field, filename] of [
    ["source", "source.md"],
    ["textExtracts", "text-extracts.md"],
    ["validation", "validation.md"],
  ] as const) {
    try {
      const f = await readFunnelFile(join(base, filename));
      result[field] = f.content;
    } catch {
      /* leave null */
    }
  }
  return result;
}

/**
 * List the top-level funnel-base files and per-act / per-vertical analysis files.
 * Used for the MCP resources/list response — agents can enumerate available context.
 */
export async function listFunnelFiles(): Promise<string[]> {
  const files: string[] = [];

  // Top-level *.md files
  const topLevel = await safeReaddir(FUNNEL_BASE_ROOT);
  for (const entry of topLevel) {
    if (entry.endsWith(".md")) files.push(entry);
  }

  // 01-acts/*.md
  const acts = await safeReaddir(join(FUNNEL_BASE_ROOT, "01-acts"));
  for (const a of acts) if (a.endsWith(".md")) files.push(`01-acts/${a}`);

  // 02-verticals/*.md
  const verticals = await safeReaddir(join(FUNNEL_BASE_ROOT, "02-verticals"));
  for (const v of verticals) if (v.endsWith(".md")) files.push(`02-verticals/${v}`);

  // law-texts top-level (e.g. VALIDATION-SUMMARY)
  const lt = await safeReaddir(join(FUNNEL_BASE_ROOT, "law-texts"));
  for (const e of lt) if (e.endsWith(".md")) files.push(`law-texts/${e}`);

  return files;
}

/**
 * Extract every statutory citation pattern from a markdown chunk. Returns
 * a list of canonical-looking refs (Article numbers, section numbers, SFS/
 * Gazzetta numbers, etc.) that downstream validation tools should check.
 *
 * Patterns recognized:
 *   - EU acts: "Art. 50(2)", "Article 99", "Annex III"
 *   - GDPR / AI Act / DSA / DORA articles with sub-paragraphs
 *   - US CFR: "45 CFR 164.504(e)", "16 CFR Part 312"
 *   - US Code: "20 USC § 1232g", "18 USC 2257"
 *   - Sweden: "BrB 6:12", "SFS 2025:586"
 *   - Italy: "Art. 612-quater", "GU n. 223"
 *   - UK: "s. 81(2)", "Schedule 13 ¶4(1)"
 *   - California: "§22605", "CA SB 243"
 *   - Texas/CO/etc state bills: "HB 1181", "SB 24-205"
 */
/**
 * Whether `text` mentions `citation` as a citation in its own right.
 *
 * A plain substring test is wrong here, and wrong in the direction that
 * matters: "Art. 50" occurs inside "Art. 50(2)", so a ledger covering only the
 * sub-paragraph would report the whole article as checked. The scanner makes
 * that collision routine — it yields both "Art. 612" and "Art. 612-quater" for
 * a single Italian citation — so the bare prefix would always claim coverage
 * it does not have.
 *
 * A mention therefore may not continue into a longer citation (a following
 * digit, letter, opening parenthesis or hyphen) nor sit inside a larger token.
 */
export function citationMentionedIn(text: string, citation: string): boolean {
  const escaped = citation.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![\\w§])${escaped}(?![\\w(\\-])`).test(text);
}

export function extractCitations(markdown: string): string[] {
  const patterns: RegExp[] = [
    // EU article citations. The period is optional so the spelled-out form
    // ("Article 99") is recognised alongside the abbreviated one ("Art. 50(2)").
    /\bArt(?:icle)?\.?\s+\d+(?:\(\d+\)(?:\(\w\))?)?/g,
    /\bAnnex\s+[IVX]+/gi,
    // US CFR
    /\b\d+\s+CFR\s+(?:Part\s+)?\d+(?:\.\d+)?(?:\(\w+\))?/g,
    // US Code. Section numbers may carry a trailing letter suffix that is part
    // of the section itself ("20 USC § 1232g"), not a sub-paragraph.
    /\b\d+\s+USC\s+§?\s?\d+[a-z]?(?:\(\w\))?/g,
    /\b18\s+USC\s+2257/g,
    // Sweden Brottsbalken
    /\bBrB\s+\d+:\d+/g,
    /\bSFS\s+\d{4}:\d+/g,
    // Italian Codice Penale articles
    /\bArt\.\s+612-quater/g,
    /\bGU\s+n\.\s+\d+/g,
    /\bGU\s+Serie\s+Generale\s+n\.\s+\d+/g,
    // UK OSA section numbers
    /\bs\.\s+\d+(?:\(\d+\))?/g,
    /\bSchedule\s+\d+(?:\s+¶\d+(?:\(\d+\))?)?/gi,
    // California codes. No leading \b: the section sign is not a word
    // character, so a word boundary before it never matches after whitespace.
    /§\s?226\d{2}/g,
    /\bCal\.\s+(?:Bus|Health|Civil|Labor)/g,
    // US state bill numbers
    /\b(?:HB|SB|AB)\s+\d+(?:-\d+)?/g,
    // Public Chapter (Tennessee)
    /\bPublic\s+Chapter\s+\d+/gi,
  ];

  const matches = new Set<string>();
  for (const pattern of patterns) {
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(markdown)) !== null) {
      matches.add(m[0].trim());
    }
  }
  return Array.from(matches).sort();
}
