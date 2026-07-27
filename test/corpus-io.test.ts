// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Agonist Development AB
/**
 * Filesystem tests for the corpus loader, run against a synthetic corpus
 * created in a temp directory. FUNNEL_BASE_ROOT is read at module-evaluation
 * time, so the loader is imported dynamically after the variable is set.
 */
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

type Loader = typeof import("../src/funnel-loader.js");

let root: string;
let loader: Loader;

async function write(relativePath: string, content: string): Promise<void> {
  const absolute = join(root, relativePath);
  await mkdir(join(absolute, ".."), { recursive: true });
  await writeFile(absolute, content, "utf8");
}

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "funnel-base-test-"));

  await write("overview.md", "# Overview\n");
  await write("01-acts/example-act.md", "# Example act analysis\n");
  await write("02-verticals/example-vertical.md", "# Example vertical\n");
  await write("law-texts/VALIDATION-SUMMARY.md", "# Ledger\n\n- Art. 50(2) confirmed\n");

  await write("law-texts/example-act/source.md", "fetchStatus: fetched-ok\n");
  await write("law-texts/example-act/text-extracts.md", "Verbatim text of Art. 50(2).\n");
  await write("law-texts/example-act/validation.md", "Art. 50(2): CONFIRMED\n");

  await write("law-texts/partial-act/source.md", "fetch-status: partial\n");
  await write("law-texts/pending-act/source.md", "Manual fetch required.\n");
  await write("law-texts/silent-act/source.md", "No status line here.\n");

  await write("law-texts/example-bundle/sub-jurisdiction/source.md", "fetchStatus: fetched-ok\n");
  await write("law-texts/example-bundle/sub-jurisdiction/text-extracts.md", "Nested text.\n");

  process.env.FUNNEL_BASE_ROOT = root;
  vi.resetModules();
  loader = await import("../src/funnel-loader.js");
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("FUNNEL_BASE_ROOT", () => {
  it("resolves from the environment variable", () => {
    expect(loader.FUNNEL_BASE_ROOT).toBe(root);
  });
});

describe("readFunnelFile", () => {
  it("returns content, resolved path and byte size", async () => {
    const file = await loader.readFunnelFile("overview.md");
    expect(file.path).toBe("overview.md");
    expect(file.absolutePath).toBe(join(root, "overview.md"));
    expect(file.content).toContain("# Overview");
    expect(file.sizeBytes).toBe(Buffer.byteLength(file.content, "utf8"));
  });

  it("reads a nested path", async () => {
    const file = await loader.readFunnelFile("01-acts/example-act.md");
    expect(file.content).toContain("Example act analysis");
  });

  it("blocks a path that escapes the corpus root", async () => {
    await expect(loader.readFunnelFile("../escaped.md")).rejects.toThrow(
      /Path traversal blocked/,
    );
  });

  it("blocks a deep traversal attempt", async () => {
    await expect(loader.readFunnelFile("law-texts/../../../etc/hosts")).rejects.toThrow(
      /Path traversal blocked/,
    );
  });

  it("propagates a read error for a missing file", async () => {
    await expect(loader.readFunnelFile("does-not-exist.md")).rejects.toThrow();
  });
});

describe("listLawTextSlugs", () => {
  it("lists every statute directory, sorted", async () => {
    const slugs = await loader.listLawTextSlugs();
    const names = slugs.map((s) => s.slug);
    expect(names).toEqual([...names].sort());
    expect(names).toContain("example-act");
    expect(names).toContain("partial-act");
  });

  it("ignores non-directory entries such as the ledger file", async () => {
    const slugs = await loader.listLawTextSlugs();
    expect(slugs.map((s) => s.slug)).not.toContain("VALIDATION-SUMMARY.md");
  });

  it("reports which of the three files each statute has", async () => {
    const slugs = await loader.listLawTextSlugs();
    const complete = slugs.find((s) => s.slug === "example-act");
    expect(complete).toMatchObject({
      hasSource: true,
      hasExtracts: true,
      hasValidation: true,
    });
    const sourceOnly = slugs.find((s) => s.slug === "partial-act");
    expect(sourceOnly).toMatchObject({
      hasSource: true,
      hasExtracts: false,
      hasValidation: false,
    });
  });

  it("parses the fetch status in both spellings", async () => {
    const slugs = await loader.listLawTextSlugs();
    expect(slugs.find((s) => s.slug === "example-act")?.fetchStatus).toBe("fetched-ok");
    expect(slugs.find((s) => s.slug === "partial-act")?.fetchStatus).toBe("partial");
  });

  it("maps a manual-fetch note to the pending status", async () => {
    const slugs = await loader.listLawTextSlugs();
    expect(slugs.find((s) => s.slug === "pending-act")?.fetchStatus).toBe("pending");
  });

  it("leaves the status undefined when source.md declares none", async () => {
    const slugs = await loader.listLawTextSlugs();
    expect(slugs.find((s) => s.slug === "silent-act")?.fetchStatus).toBeUndefined();
  });

  it("descends one level into nested jurisdiction bundles", async () => {
    const slugs = await loader.listLawTextSlugs();
    const nested = slugs.find((s) => s.slug === "example-bundle/sub-jurisdiction");
    expect(nested).toMatchObject({ hasSource: true, hasExtracts: true, hasValidation: false });
  });
});

describe("readLawTextBundle", () => {
  it("returns all three documents when present", async () => {
    const bundle = await loader.readLawTextBundle("example-act");
    expect(bundle.slug).toBe("example-act");
    expect(bundle.source).toContain("fetched-ok");
    expect(bundle.textExtracts).toContain("Verbatim text");
    expect(bundle.validation).toContain("CONFIRMED");
  });

  it("returns null for each document that is absent", async () => {
    const bundle = await loader.readLawTextBundle("partial-act");
    expect(bundle.source).not.toBeNull();
    expect(bundle.textExtracts).toBeNull();
    expect(bundle.validation).toBeNull();
  });

  it("returns an all-null bundle for an unknown slug instead of throwing", async () => {
    const bundle = await loader.readLawTextBundle("no-such-statute");
    expect(bundle).toEqual({
      slug: "no-such-statute",
      source: null,
      textExtracts: null,
      validation: null,
    });
  });

  it("reads a nested jurisdiction bundle", async () => {
    const bundle = await loader.readLawTextBundle("example-bundle/sub-jurisdiction");
    expect(bundle.textExtracts).toContain("Nested text");
  });
});

describe("listFunnelFiles", () => {
  it("lists top-level, per-act, per-vertical and ledger markdown", async () => {
    const files = await loader.listFunnelFiles();
    expect(files).toContain("overview.md");
    expect(files).toContain("01-acts/example-act.md");
    expect(files).toContain("02-verticals/example-vertical.md");
    expect(files).toContain("law-texts/VALIDATION-SUMMARY.md");
  });

  it("does not descend into per-statute directories", async () => {
    const files = await loader.listFunnelFiles();
    expect(files.some((f) => f.includes("example-act/source.md"))).toBe(false);
  });
});
