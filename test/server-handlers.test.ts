// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Agonist Development AB
/**
 * End-to-end tests for the MCP surface: a real client is linked to a real
 * server over an in-memory transport, so every assertion below travels the
 * same request/response path a Claude Code session would use.
 */
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

let root: string;
let client: Client;

interface TextContent {
  type: string;
  text: string;
}

/** Concatenate the text blocks of a tool result. */
function textOf(result: unknown): string {
  const content = (result as { content?: TextContent[] }).content ?? [];
  return content.map((c) => c.text).join("\n");
}

function isError(result: unknown): boolean {
  return (result as { isError?: boolean }).isError === true;
}

/**
 * Text of the first block of a resource read. Resource contents are a
 * text-or-blob union; every resource this server serves is markdown.
 */
function resourceText(result: unknown): string {
  const first = (result as { contents?: Array<{ text?: string }> }).contents?.[0];
  return first?.text ?? "";
}

async function write(relativePath: string, content: string): Promise<void> {
  const absolute = join(root, relativePath);
  await mkdir(join(absolute, ".."), { recursive: true });
  await writeFile(absolute, content, "utf8");
}

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "funnel-base-mcp-"));
  await write("overview.md", "# Overview\n");
  await write("law-texts/VALIDATION-SUMMARY.md", "# Ledger\n\n- Art. 50(2) CONFIRMED\n");
  await write("law-texts/example-act/source.md", "fetchStatus: fetched-ok\n");
  await write("law-texts/example-act/text-extracts.md", "Verbatim text of Art. 50(2).\n");
  await write("law-texts/example-act/validation.md", "Art. 50(2): CONFIRMED\n");

  process.env.FUNNEL_BASE_ROOT = root;
  vi.resetModules();
  const { createServer } = await import("../src/server.js");

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await createServer().connect(serverTransport);
  client = new Client({ name: "funnel-base-test-client", version: "0.0.0" });
  await client.connect(clientTransport);
});

afterAll(async () => {
  await client?.close();
  await rm(root, { recursive: true, force: true });
});

describe("tools/list", () => {
  it("advertises every documented tool", async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      "get_statute",
      "list_funnel_files",
      "list_law_texts",
      "read_funnel_file",
      "validate_citation",
    ]);
  });

  it("declares the required argument of get_statute", async () => {
    const { tools } = await client.listTools();
    const getStatute = tools.find((t) => t.name === "get_statute");
    expect(getStatute?.inputSchema.required).toEqual(["slug"]);
  });
});

describe("resources", () => {
  it("lists the validation ledger and one entry per covered statute", async () => {
    const { resources } = await client.listResources();
    const uris = resources.map((r) => r.uri);
    expect(uris).toContain("funnel-base://VALIDATION-SUMMARY");
    expect(uris).toContain("funnel-base://law-texts/example-act");
  });

  it("reads the validation ledger verbatim", async () => {
    const result = await client.readResource({ uri: "funnel-base://VALIDATION-SUMMARY" });
    expect(resourceText(result)).toContain("Art. 50(2) CONFIRMED");
  });

  it("reads a statute bundle as one concatenated document", async () => {
    const result = await client.readResource({ uri: "funnel-base://law-texts/example-act" });
    const text = resourceText(result);
    expect(text).toContain("## source.md");
    expect(text).toContain("Verbatim text of Art. 50(2).");
    expect(text).toContain("## validation.md");
  });

  it("rejects an unknown resource URI", async () => {
    await expect(client.readResource({ uri: "funnel-base://nope" })).rejects.toThrow();
  });
});

describe("tools/call — corpus discovery", () => {
  it("list_law_texts reports coverage flags per statute", async () => {
    const text = textOf(await client.callTool({ name: "list_law_texts", arguments: {} }));
    expect(text).toContain("example-act");
    expect(text).toContain("status=fetched-ok");
  });

  it("list_funnel_files enumerates the corpus markdown", async () => {
    const text = textOf(await client.callTool({ name: "list_funnel_files", arguments: {} }));
    expect(text).toContain("overview.md");
    expect(text).toContain("law-texts/VALIDATION-SUMMARY.md");
  });
});

describe("tools/call — get_statute", () => {
  it("returns the full bundle for a known slug", async () => {
    const result = await client.callTool({
      name: "get_statute",
      arguments: { slug: "example-act" },
    });
    expect(isError(result)).toBe(false);
    expect(textOf(result)).toContain("Verbatim text of Art. 50(2).");
  });

  it("reports an unknown slug as a tool error rather than throwing", async () => {
    const result = await client.callTool({
      name: "get_statute",
      arguments: { slug: "no-such-statute" },
    });
    expect(isError(result)).toBe(true);
    expect(textOf(result)).toContain("Run list_law_texts");
  });

  it("rejects a missing argument", async () => {
    const result = await client.callTool({ name: "get_statute", arguments: {} });
    expect(isError(result)).toBe(true);
  });
});

describe("tools/call — validate_citation", () => {
  it("marks a citation that the ledger mentions", async () => {
    const result = await client.callTool({
      name: "validate_citation",
      arguments: { text: "The disclosure duty in Art. 50(2) applies." },
    });
    const text = textOf(result);
    expect(text).toContain("Art. 50(2)");
    expect(text).toContain("mentioned in VALIDATION-SUMMARY");
  });

  it("marks a citation absent from the ledger", async () => {
    const text = textOf(
      await client.callTool({
        name: "validate_citation",
        arguments: { text: "See also SFS 2025:586 for the Swedish rule." },
      }),
    );
    expect(text).toContain("not in VALIDATION-SUMMARY");
  });

  it("does not claim ledger coverage for an article when only a sub-paragraph is listed", async () => {
    // The ledger fixture carries Art. 50(2). A draft citing the article as a
    // whole must not come back looking checked.
    const text = textOf(
      await client.callTool({
        name: "validate_citation",
        arguments: { text: "The duty in Art. 50 applies." },
      }),
    );
    expect(text).toContain("Art. 50");
    expect(text).toContain("not in VALIDATION-SUMMARY");
  });

  it("says so plainly when no citation is recognised", async () => {
    const text = textOf(
      await client.callTool({
        name: "validate_citation",
        arguments: { text: "This sentence cites nothing." },
      }),
    );
    expect(text).toContain("No statutory citations recognized");
  });
});

describe("tools/call — read_funnel_file", () => {
  it("reads a file and reports its size", async () => {
    const text = textOf(
      await client.callTool({ name: "read_funnel_file", arguments: { path: "overview.md" } }),
    );
    expect(text).toContain("# Overview");
    expect(text).toContain("_Size:");
  });

  it("refuses to read outside the corpus root", async () => {
    const result = await client.callTool({
      name: "read_funnel_file",
      arguments: { path: "../../../etc/hosts" },
    });
    expect(isError(result)).toBe(true);
    expect(textOf(result)).toContain("Path traversal blocked");
  });
});

describe("tools/call — unknown tool", () => {
  it("returns a tool error instead of crashing the session", async () => {
    const result = await client.callTool({ name: "no_such_tool", arguments: {} });
    expect(isError(result)).toBe(true);
    expect(textOf(result)).toContain("Unknown tool");
  });
});

describe("advertised version", () => {
  it("matches the package manifest", async () => {
    // The server reports this version to every client that connects. It is a
    // separate constant from the manifest, so nothing but this test stops the
    // two drifting apart at the next release.
    const { SERVER_VERSION } = await import("../src/server.js");
    const pkg = JSON.parse(
      await readFile(new URL("../package.json", import.meta.url), "utf8"),
    ) as { version: string };
    expect(SERVER_VERSION).toBe(pkg.version);
  });
});
