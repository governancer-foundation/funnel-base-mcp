// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Agonist Development AB
/**
 * Unit tests for extractCitations — the pure regex scanner behind the
 * validate_citation tool. No filesystem access, no corpus required.
 */
import { describe, expect, it } from "vitest";

import { citationMentionedIn, extractCitations } from "../src/funnel-loader.js";

describe("extractCitations — EU acts", () => {
  it("recognises the abbreviated article form with a sub-paragraph", () => {
    expect(extractCitations("see Art. 50(2) for the disclosure duty")).toContain("Art. 50(2)");
  });

  it("recognises the spelled-out article form without a period", () => {
    expect(extractCitations("penalties are set in Article 99")).toContain("Article 99");
  });

  it("recognises a point-level citation", () => {
    expect(extractCitations("per Art. 6(1)(a) of the act")).toContain("Art. 6(1)(a)");
  });

  it("recognises annexes in roman numerals", () => {
    const found = extractCitations("listed in Annex III and Annex IV");
    expect(found).toContain("Annex III");
    expect(found).toContain("Annex IV");
  });

  it("does not treat a lowercase word as an article citation", () => {
    expect(extractCitations("the art 5 exhibition opens")).toEqual([]);
  });
});

describe("extractCitations — United States", () => {
  it("recognises a CFR section with a paragraph", () => {
    expect(extractCitations("under 45 CFR 164.504(e)")).toContain("45 CFR 164.504(e)");
  });

  it("recognises a CFR part", () => {
    expect(extractCitations("governed by 16 CFR Part 312")).toContain("16 CFR Part 312");
  });

  it("keeps the letter suffix of a US Code section", () => {
    expect(extractCitations("records under 20 USC § 1232g")).toContain("20 USC § 1232g");
  });

  it("recognises a US Code citation written without the section sign", () => {
    expect(extractCitations("record-keeping under 18 USC 2257")).toContain("18 USC 2257");
  });

  it("recognises state bill numbers in both plain and hyphenated form", () => {
    const found = extractCitations("compare HB 1181 with SB 24-205");
    expect(found).toContain("HB 1181");
    expect(found).toContain("SB 24-205");
  });

  it("recognises a state bill cited with a state prefix", () => {
    expect(extractCitations("California enacted CA SB 243")).toContain("SB 243");
  });

  it("recognises a California code section", () => {
    expect(extractCitations("see §22605 of the code")).toContain("§22605");
  });

  it("recognises a Tennessee public chapter", () => {
    expect(extractCitations("enacted as Public Chapter 1100")).toContain("Public Chapter 1100");
  });
});

describe("extractCitations — Sweden, Italy, United Kingdom", () => {
  it("recognises a Brottsbalken chapter:section citation", () => {
    expect(extractCitations("criminalised by BrB 6:12")).toContain("BrB 6:12");
  });

  it("recognises an SFS number", () => {
    expect(extractCitations("amended by SFS 2025:586")).toContain("SFS 2025:586");
  });

  it("recognises an Italian Gazzetta Ufficiale number", () => {
    expect(extractCitations("published in GU n. 223")).toContain("GU n. 223");
  });

  it("recognises a UK section citation", () => {
    expect(extractCitations("the duty in s. 81(2) applies")).toContain("s. 81(2)");
  });

  it("recognises a UK schedule with a paragraph", () => {
    expect(extractCitations("Schedule 13 ¶4(1) sets the threshold")).toContain(
      "Schedule 13 ¶4(1)",
    );
  });

  it("also yields the article-number prefix of a bis/quater article", () => {
    // The Italian-specific pattern and the generic EU article pattern both fire
    // on "Art. 612-quater", so the numeric prefix appears alongside the full
    // citation. Both are reported; the reviewer resolves which one is meant.
    const found = extractCitations("introduced as Art. 612-quater");
    expect(found).toContain("Art. 612-quater");
    expect(found).toContain("Art. 612");
  });
});

describe("extractCitations — result shape", () => {
  it("returns an empty list when nothing matches", () => {
    expect(extractCitations("this paragraph cites nothing at all")).toEqual([]);
  });

  it("deduplicates repeated citations", () => {
    const found = extractCitations("Art. 50(2) is restated in Art. 50(2) below");
    expect(found.filter((c) => c === "Art. 50(2)")).toHaveLength(1);
  });

  it("returns citations sorted", () => {
    const found = extractCitations("SFS 2025:586 and Annex III and BrB 6:12");
    expect(found).toEqual([...found].sort());
  });

  it("does not leak regex state between calls", () => {
    const first = extractCitations("Art. 50(2)");
    const second = extractCitations("Art. 50(2)");
    expect(second).toEqual(first);
  });
});

describe("citationMentionedIn — a mention must stand on its own", () => {
  const ledger = [
    "# Validation summary",
    "",
    "- `Art. 50(2)` — CONFIRMED",
    "- `Art. 612-quater` — CORRECTED",
    "- `SFS 2025:586` — CONFIRMED",
    "- `20 USC § 1232g` — UNVERIFIABLE",
  ].join("\n");

  it("finds a citation the ledger actually carries", () => {
    expect(citationMentionedIn(ledger, "Art. 50(2)")).toBe(true);
  });

  it("does not report an article as covered when only its sub-paragraph is", () => {
    // The whole point: "Art. 50" occurs inside "Art. 50(2)", but the ledger
    // says nothing about the article as a whole.
    expect(citationMentionedIn(ledger, "Art. 50")).toBe(false);
  });

  it("does not report a numeric prefix of a bis/quater article as covered", () => {
    // The scanner yields both forms for one Italian citation, so this pair
    // occurs on every such scan.
    expect(citationMentionedIn(ledger, "Art. 612-quater")).toBe(true);
    expect(citationMentionedIn(ledger, "Art. 612")).toBe(false);
  });

  it("does not truncate a US Code section to a shorter one", () => {
    expect(citationMentionedIn(ledger, "20 USC § 1232g")).toBe(true);
    expect(citationMentionedIn(ledger, "20 USC § 1232")).toBe(false);
  });

  it("does not match an SFS number that is a prefix of another", () => {
    expect(citationMentionedIn(ledger, "SFS 2025:58")).toBe(false);
  });

  it("matches at the end of a line and before punctuation", () => {
    expect(citationMentionedIn("checked: Art. 99.", "Art. 99")).toBe(true);
    expect(citationMentionedIn("checked: Art. 99", "Art. 99")).toBe(true);
  });

  it("treats regex metacharacters in a citation as literal text", () => {
    expect(citationMentionedIn("see §22605 today", "§22605")).toBe(true);
    expect(citationMentionedIn("see 45 CFR 164.504(e) today", "45 CFR 164.504(e)")).toBe(true);
  });

  it("returns false against empty text", () => {
    expect(citationMentionedIn("", "Art. 50(2)")).toBe(false);
  });
});
