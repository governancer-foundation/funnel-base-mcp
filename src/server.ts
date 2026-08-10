// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Agonist Development AB
/**
 * Funnel-Base MCP Server — request handlers.
 *
 * Exposes a corpus of validated primary-source statutory text as MCP
 * resources and tools, so a Claude Code session or CI agent can fetch
 * verbatim law text and cross-check citations against a validation ledger
 * without re-reading the whole corpus on every turn (cache-friendly).
 *
 * The corpus directory is provided at runtime via the FUNNEL_BASE_ROOT
 * environment variable (see funnel-loader.ts). The server is read-only and
 * makes no network calls; it never writes to the corpus.
 *
 * This module builds a server and registers handlers; it starts nothing. The
 * executable that binds it to a stdio transport is index.ts. Keeping the two
 * apart lets tests drive the handlers over an in-memory transport.
 *
 * Tools exposed:
 *
 *   - list_law_texts              → all slugs with coverage status
 *   - get_statute(slug)           → verbatim text + validation status
 *   - validate_citation(text)     → scan text for citations + cross-check ledger
 *   - read_funnel_file(path)      → read a file under the corpus root
 *   - list_funnel_files           → discover available corpus files
 *
 * Resources exposed:
 *
 *   funnel-base://VALIDATION-SUMMARY   → the citation validation ledger
 *   funnel-base://law-texts/<slug>     → per-statute primary-text bundle
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import {
  FUNNEL_BASE_ROOT,
  citationMentionedIn,
  extractCitations,
  listFunnelFiles,
  listLawTextSlugs,
  readFunnelFile,
  readLawTextBundle,
} from "./funnel-loader.js";

export const SERVER_NAME = "governancer-funnel-base";
export const SERVER_VERSION = "0.1.0";

const URI_TO_FILE: Record<string, string> = {
  "funnel-base://VALIDATION-SUMMARY": "law-texts/VALIDATION-SUMMARY.md",
};

const GetStatuteInput = z.object({ slug: z.string().min(1) });
const ValidateCitationInput = z.object({ text: z.string().min(1) });
const ReadFunnelFileInput = z.object({ path: z.string().min(1) });

/**
 * Build a server with every resource and tool handler registered. The caller
 * connects it to a transport.
 */
export function createServer(): Server {
  const server = new Server(
    {
      name: SERVER_NAME,
      version: SERVER_VERSION,
    },
    {
      capabilities: {
        resources: {},
        tools: {},
      },
    },
  );

  // ── Resource list ──────────────────────────────────────────────────────

  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    const slugs = await listLawTextSlugs();
    const resources = [
      {
        uri: "funnel-base://VALIDATION-SUMMARY",
        name: "Validation Summary",
        description:
          "The citation validation ledger — the consolidated set of corrections discovered during the primary-source validation pass. Read this before making statutory claims; cite its status verbatim.",
        mimeType: "text/markdown",
      },
    ];

    for (const s of slugs) {
      if (!s.hasExtracts && !s.hasSource) continue;
      const status = s.fetchStatus ?? (s.hasExtracts ? "available" : "metadata-only");
      resources.push({
        uri: `funnel-base://law-texts/${s.slug}`,
        name: `Law text: ${s.slug}`,
        description: `Primary statutory text bundle (source + text-extracts + validation). Fetch status: ${status}.`,
        mimeType: "text/markdown",
      });
    }

    return { resources };
  });

  // ── Resource read ──────────────────────────────────────────────────────

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const uri = request.params.uri;

    if (URI_TO_FILE[uri]) {
      const f = await readFunnelFile(URI_TO_FILE[uri]);
      return {
        contents: [
          {
            uri,
            mimeType: "text/markdown",
            text: f.content,
          },
        ],
      };
    }

    if (uri.startsWith("funnel-base://law-texts/")) {
      const slug = uri.slice("funnel-base://law-texts/".length);
      const bundle = await readLawTextBundle(slug);
      const parts: string[] = [`# Law text bundle: ${slug}\n`];
      if (bundle.source) parts.push("## source.md\n\n" + bundle.source);
      if (bundle.textExtracts) parts.push("\n## text-extracts.md\n\n" + bundle.textExtracts);
      if (bundle.validation) parts.push("\n## validation.md\n\n" + bundle.validation);
      if (parts.length === 1)
        parts.push(`\n(No files found under law-texts/${slug}/ — may be pending manual fetch.)`);
      return {
        contents: [
          {
            uri,
            mimeType: "text/markdown",
            text: parts.join("\n"),
          },
        ],
      };
    }

    throw new Error(`Unknown resource URI: ${uri}`);
  });

  // ── Tool list ──────────────────────────────────────────────────────────

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "list_law_texts",
        description:
          "List all law-texts slugs with coverage status (fetched-ok / partial / inaccessible / pending). Call this FIRST when you need to know what statutes have validated primary-source text available.",
        inputSchema: {
          type: "object",
          properties: {},
          additionalProperties: false,
        },
      },
      {
        name: "get_statute",
        description:
          "Return the full law-text bundle (source.md + text-extracts.md + validation.md) for a single statute slug. Use BEFORE making any statutory claim in customer-facing materials — verbatim primary text is the source of truth, not training data.",
        inputSchema: {
          type: "object",
          properties: {
            slug: {
              type: "string",
              description:
                "Slug as returned by list_law_texts (e.g. 'example-act', 'example-bundle/sub-jurisdiction').",
            },
          },
          required: ["slug"],
          additionalProperties: false,
        },
      },
      {
        name: "validate_citation",
        description:
          "Scan a chunk of markdown for statutory citations and return a structured list of what was found, plus links to the corresponding law-texts/<slug>/validation.md files. Use this on any draft text BEFORE committing.",
        inputSchema: {
          type: "object",
          properties: {
            text: {
              type: "string",
              description: "Markdown content (PRD section, sub-PRD, vertical doc, etc.) to scan.",
            },
          },
          required: ["text"],
          additionalProperties: false,
        },
      },
      {
        name: "read_funnel_file",
        description:
          "Read any file under funnel-base/ by its relative path (e.g. '01-acts/example-act.md'). Path-traversal protected.",
        inputSchema: {
          type: "object",
          properties: {
            path: {
              type: "string",
              description: "Path relative to funnel-base/ root.",
            },
          },
          required: ["path"],
          additionalProperties: false,
        },
      },
      {
        name: "list_funnel_files",
        description:
          "List the available corpus markdown files (top-level analysis + per-act + per-vertical + law-texts/ bundles). Use to discover what's available before calling read_funnel_file.",
        inputSchema: {
          type: "object",
          properties: {},
          additionalProperties: false,
        },
      },
    ],
  }));

  // ── Tool dispatch ──────────────────────────────────────────────────────

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      switch (name) {
        case "list_law_texts": {
          const slugs = await listLawTextSlugs();
          const lines = slugs.map((s) => {
            const status = s.fetchStatus ?? (s.hasExtracts ? "available" : "metadata-only");
            const flags = [
              s.hasSource ? "src" : "—",
              s.hasExtracts ? "ext" : "—",
              s.hasValidation ? "val" : "—",
            ].join("/");
            return `- ${s.slug}  [${flags}]  status=${status}`;
          });
          return {
            content: [
              {
                type: "text",
                text: `# Law-texts coverage (${slugs.length} slugs)\n\nFlags: src=source.md / ext=text-extracts.md / val=validation.md\n\n${lines.join("\n")}\n\nFunnel-base root: ${FUNNEL_BASE_ROOT}`,
              },
            ],
          };
        }

        case "get_statute": {
          const { slug } = GetStatuteInput.parse(args);
          const bundle = await readLawTextBundle(slug);
          if (!bundle.source && !bundle.textExtracts && !bundle.validation) {
            return {
              content: [
                {
                  type: "text",
                  text: `No law-text bundle found for slug "${slug}". Run list_law_texts to see available slugs.`,
                },
              ],
              isError: true,
            };
          }
          const parts: string[] = [`# Law-text bundle: ${slug}\n`];
          if (bundle.source) parts.push("## source.md\n\n" + bundle.source);
          if (bundle.textExtracts) parts.push("\n## text-extracts.md\n\n" + bundle.textExtracts);
          if (bundle.validation) parts.push("\n## validation.md\n\n" + bundle.validation);
          return { content: [{ type: "text", text: parts.join("\n") }] };
        }

        case "validate_citation": {
          const { text } = ValidateCitationInput.parse(args);
          const citations = extractCitations(text);
          if (citations.length === 0) {
            return {
              content: [
                {
                  type: "text",
                  text: "No statutory citations recognized in the provided text. (Regex-based scan — manual lawyer review is still required for customer-facing materials.)",
                },
              ],
            };
          }
          const slugs = await listLawTextSlugs();
          const summary = await readFunnelFile("law-texts/VALIDATION-SUMMARY.md").catch(
            () => null,
          );

          const lines: string[] = [];
          lines.push(`# Citation scan: ${citations.length} candidates\n`);
          for (const c of citations) {
            const summaryMatch =
              summary !== null && citationMentionedIn(summary.content, c)
                ? "✓ mentioned in VALIDATION-SUMMARY"
                : "— not in VALIDATION-SUMMARY";
            lines.push(`- \`${c}\`  ${summaryMatch}`);
          }
          lines.push(
            "\n## How to use this scan\n\n" +
              "1. **For each citation flagged as mentioned in VALIDATION-SUMMARY:** read the surrounding rows in `law-texts/VALIDATION-SUMMARY.md` to confirm it's a 🟢 confirmation, 🟧 high-severity correction, or 🟥 critical correction.\n" +
              "2. **For each citation NOT in VALIDATION-SUMMARY:** call `get_statute(slug)` for the corresponding law-texts subdirectory to read the verbatim text. If no bundle exists, the citation is `[unverified — pending primary fetch]`.\n" +
              "3. **Customer-facing materials must always cite VALIDATION-SUMMARY status verbatim — don't paraphrase.**\n\n" +
              `Available law-text slugs: ${slugs.length}.`,
          );
          return { content: [{ type: "text", text: lines.join("\n") }] };
        }

        case "read_funnel_file": {
          const { path } = ReadFunnelFileInput.parse(args);
          const f = await readFunnelFile(path);
          return {
            content: [
              {
                type: "text",
                text: `# ${f.path}\n\n${f.content}\n\n---\n_Size: ${f.sizeBytes} bytes_`,
              },
            ],
          };
        }

        case "list_funnel_files": {
          const files = await listFunnelFiles();
          return {
            content: [
              {
                type: "text",
                text:
                  `# Funnel-base files (${files.length})\n\n` +
                  files.map((f) => `- ${f}`).join("\n"),
              },
            ],
          };
        }

        default:
          return {
            content: [{ type: "text", text: `Unknown tool: ${name}` }],
            isError: true,
          };
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: "text", text: `Tool error: ${message}` }],
        isError: true,
      };
    }
  });

  return server;
}
