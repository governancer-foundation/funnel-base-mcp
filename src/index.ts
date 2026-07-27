#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Agonist Development AB
/**
 * Executable entrypoint — binds the funnel-base MCP server to a stdio
 * transport. All request handling lives in server.ts.
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { createServer } from "./server.js";

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await createServer().connect(transport);
  // No console output — MCP communicates over stdio, so anything written to
  // stdout would corrupt the protocol. Errors land on stderr via the SDK.
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${err instanceof Error ? err.stack : String(err)}\n`);
  process.exit(1);
});
