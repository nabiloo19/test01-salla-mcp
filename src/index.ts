#!/usr/bin/env node

/**
 * Salla MCP Server
 *
 * Runs in two modes depending on environment:
 *
 *   stdio (default) — for Claude Desktop, Cursor, VS Code
 *   http            — for Claude.ai, ChatGPT, Lovable (set HTTP_MODE=true)
 *
 * Architecture:
 *   Knowledge Layer → proxied from APIDog (site-id: 451700)
 *   Action Layer    → Salla Partner API tools (TBD with tech team)
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import * as dotenv from "dotenv";
import * as path from "path";
import * as fs from "fs";

import { ApidogProxy } from "./proxy/apidog.js";
import { ACTION_TOOLS, executeActionTool } from "./actions/index.js";
import { startHttpServer } from "./https.js";

// ── Load .env ──────────────────────────────────────────────────────────────
const envPath = path.resolve(process.cwd(), ".env");
if (fs.existsSync(envPath)) dotenv.config({ path: envPath });
else dotenv.config();

// ── Config ─────────────────────────────────────────────────────────────────
const APIDOG_SITE_ID = process.env.APIDOG_SITE_ID ?? "451700";
const PORT = parseInt(process.env.PORT ?? "3000", 10);
const SERVER_NAME = "salla-mcp-server";
const SERVER_VERSION = "1.0.0";
const DEPLOYMENT_HTTP_HINT =
  Boolean(process.env.RAILWAY_ENVIRONMENT) ||
  Boolean(process.env.RAILWAY_PROJECT_ID) ||
  Boolean(process.env.RENDER) ||
  (Boolean(process.env.PORT) && process.env.HTTP_MODE == null);
const HTTP_MODE =
  process.env.HTTP_MODE === "true" ||
  (process.env.HTTP_MODE == null && DEPLOYMENT_HTTP_HINT);

// ── Initialise APIDog proxy ────────────────────────────────────────────────
const apidogProxy = new ApidogProxy(APIDOG_SITE_ID);

function createMcpServer(): Server {
  const server = new Server(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { capabilities: { tools: {} } }
  );

  // ── tools/list ───────────────────────────────────────────────────────────
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    await apidogProxy.init();

    const knowledgeTools: Tool[] = apidogProxy.getTools().map((t) => ({
      name: t.name,
      description: t.description ?? t.name,
      inputSchema: (t.inputSchema as Tool["inputSchema"]) ?? {
        type: "object" as const,
        properties: {},
      },
    }));

    const actionTools: Tool[] = ACTION_TOOLS.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    }));

    const allTools = [...knowledgeTools, ...actionTools];

    process.stderr.write(
      `[Salla MCP] Serving ${knowledgeTools.length} knowledge tools + ${actionTools.length} action tools\n`
    );

    return { tools: allTools };
  });

  // ── tools/call ───────────────────────────────────────────────────────────
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const safeArgs = (args ?? {}) as Record<string, unknown>;

    process.stderr.write(`[Salla MCP] Tool called: ${name}\n`);

    // Knowledge layer
    if (apidogProxy.isKnowledgeTool(name)) {
      try {
        await apidogProxy.init();
        const result = await apidogProxy.callTool(name, safeArgs);
        return result as { content: Array<{ type: string; text: string }> };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text", text: `Knowledge layer error: ${message}` }],
          isError: true,
        };
      }
    }

    // Action layer
    if (ACTION_TOOLS.some((t) => t.name === name)) {
      try {
        return await executeActionTool(name, safeArgs);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text", text: `Action layer error: ${message}` }],
          isError: true,
        };
      }
    }

    return {
      content: [{ type: "text", text: `Unknown tool: "${name}"` }],
      isError: true,
    };
  });

  return server;
}

// ── Start ──────────────────────────────────────────────────────────────────
async function main() {
  process.stderr.write(
    `[Salla MCP] Starting ${SERVER_NAME} v${SERVER_VERSION}\n`
  );
  process.stderr.write(`[Salla MCP] APIDog site ID: ${APIDOG_SITE_ID}\n`);
  process.stderr.write(
    `[Salla MCP] Mode: ${HTTP_MODE ? "HTTP/SSE" : "stdio"}\n`
  );
  process.stderr.write(
    `[Salla MCP] Action tools: ${
      ACTION_TOOLS.length > 0
        ? ACTION_TOOLS.map((t) => t.name).join(", ")
        : "none yet (TBD with tech team)"
    }\n`
  );

  // Pre-init APIDog
  try {
    await apidogProxy.init();
  } catch {
    process.stderr.write(
      "[Salla MCP] Warning: APIDog failed to initialise at startup. Will retry on first call.\n"
    );
  }

  if (HTTP_MODE) {
    // HTTP/SSE mode — for Railway, Claude.ai, ChatGPT, Lovable
    startHttpServer(createMcpServer, PORT);
  } else {
    // stdio mode — for Claude Desktop, Cursor, VS Code
    const server = createMcpServer();
    const transport = new StdioServerTransport();
    await server.connect(transport);
    process.stderr.write("[Salla MCP] Server running — waiting for tool calls\n");
  }

  // Graceful shutdown
  const shutdown = () => {
    process.stderr.write("\n[Salla MCP] Shutting down...\n");
    apidogProxy.shutdown();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  process.stderr.write(`[Salla MCP] Fatal error: ${err.message}\n`);
  process.exit(1);
});
