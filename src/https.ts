/**
 * HTTP/SSE Transport Layer
 *
 * Adds a public URL to the Salla MCP server so Claude.ai,
 * ChatGPT, and Lovable can connect via HTTP instead of stdio.
 *
 * Endpoints:
 *   GET  /sse      → SSE stream (Claude.ai, Lovable)
 *   POST /messages → receive messages from client
 *   GET  /health   → health check (Railway, uptime monitors)
 */

import http from "http";
import { randomUUID } from "node:crypto";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";

type ManagedServer = Server & { close?: () => Promise<void> | void };

type StreamableSession = {
  server: Server;
  transport: StreamableHTTPServerTransport;
};

type SseSession = {
  server: Server;
  transport: SSEServerTransport;
};

function getHeaderValue(
  value: string | string[] | undefined
): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

async function readJsonBody(req: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];

  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (chunks.length === 0) return undefined;

  const rawBody = Buffer.concat(chunks).toString("utf8").trim();
  if (!rawBody) return undefined;

  return JSON.parse(rawBody);
}

export function startHttpServer(
  createMcpServer: () => Server,
  port: number = 3000
): http.Server {
  const host = "0.0.0.0";
  const streamableSessions = new Map<string, StreamableSession>();
  const sseSessions = new Map<string, SseSession>();
  const onServerError = (err: NodeJS.ErrnoException) => {
    const message = err.message || String(err);
    process.stderr.write(`[Salla MCP HTTP] Listen error: ${message}\n`);
  };
  const closeServer = async (server: Server, sessionId: string) => {
    const closableServer = server as ManagedServer;
    await Promise.resolve(closableServer.close?.()).catch((err) => {
      const message = err instanceof Error ? err.message : String(err);
      process.stderr.write(
        `[Salla MCP HTTP] Server close error (${sessionId}): ${message}\n`
      );
    });
  };

  const httpServer = http.createServer(async (req, res) => {
    // ── CORS headers — required for browser-based clients ──────────────
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, Mcp-Session-Id, Last-Event-ID, Accept"
    );
    res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url ?? "/", `http://localhost:${port}`);

    // ── GET /health — for Railway and uptime checks ────────────────────
    if (req.method === "GET" && url.pathname === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          status: "ok",
          server: "salla-mcp-server",
          version: "1.0.0",
          timestamp: new Date().toISOString(),
        })
      );
      return;
    }

    // ── /mcp — Streamable HTTP transport (recommended) ─────────────────
    if (url.pathname === "/mcp") {
      const sessionId = getHeaderValue(req.headers["mcp-session-id"]);

      if (req.method === "POST") {
        let parsedBody: unknown;
        try {
          parsedBody = await readJsonBody(req);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              jsonrpc: "2.0",
              error: { code: -32700, message: `Invalid JSON body: ${message}` },
              id: null,
            })
          );
          return;
        }

        try {
          let session = sessionId ? streamableSessions.get(sessionId) : undefined;

          if (!session) {
            if (!isInitializeRequest(parsedBody)) {
              res.writeHead(400, { "Content-Type": "application/json" });
              res.end(
                JSON.stringify({
                  jsonrpc: "2.0",
                  error: {
                    code: -32000,
                    message: "Bad Request: No valid session ID provided",
                  },
                  id: null,
                })
              );
              return;
            }

            const server = createMcpServer();
            const transport = new StreamableHTTPServerTransport({
              sessionIdGenerator: () => randomUUID(),
              onsessioninitialized: (newSessionId) => {
                streamableSessions.set(newSessionId, { server, transport });
                process.stderr.write(
                  `[Salla MCP HTTP] Streamable HTTP session opened: ${newSessionId}\n`
                );
              },
            });

            transport.onclose = () => {
              const activeSessionId = transport.sessionId;
              if (activeSessionId) {
                streamableSessions.delete(activeSessionId);
                process.stderr.write(
                  `[Salla MCP HTTP] Streamable HTTP session closed: ${activeSessionId}\n`
                );
                void closeServer(server, activeSessionId);
              }
            };

            session = { server, transport };
            await server.connect(transport);
          }

          await session.transport.handleRequest(req, res, parsedBody);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          process.stderr.write(
            `[Salla MCP HTTP] Streamable HTTP POST error: ${message}\n`
          );
          if (!res.headersSent) {
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(
              JSON.stringify({
                jsonrpc: "2.0",
                error: { code: -32603, message: "Internal server error" },
                id: null,
              })
            );
          }
        }
        return;
      }

      if (req.method === "GET" || req.method === "DELETE") {
        if (!sessionId) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              jsonrpc: "2.0",
              error: {
                code: -32000,
                message: "Bad Request: Mcp-Session-Id header is required",
              },
              id: null,
            })
          );
          return;
        }

        const session = streamableSessions.get(sessionId);
        if (!session) {
          res.writeHead(404, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              jsonrpc: "2.0",
              error: {
                code: -32001,
                message: "Session not found",
              },
              id: null,
            })
          );
          return;
        }

        try {
          await session.transport.handleRequest(req, res);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          process.stderr.write(
            `[Salla MCP HTTP] Streamable HTTP ${req.method} error: ${message}\n`
          );
          if (!res.headersSent) {
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(
              JSON.stringify({
                jsonrpc: "2.0",
                error: { code: -32603, message: "Internal server error" },
                id: null,
              })
            );
          }
        }
        return;
      }
    }

    // ── GET /sse — SSE stream for Claude.ai and Lovable ───────────────
    if (req.method === "GET" && url.pathname === "/sse") {
      process.stderr.write("[Salla MCP HTTP] New SSE connection\n");

      const server = createMcpServer();
      const transport = new SSEServerTransport("/messages", res);
      const sessionId = transport.sessionId;

      sseSessions.set(sessionId, { server, transport });

      res.on("close", () => {
        process.stderr.write(
          `[Salla MCP HTTP] SSE connection closed: ${sessionId}\n`
        );
        sseSessions.delete(sessionId);
        void closeServer(server, sessionId);
      });

      try {
        await server.connect(transport);
      } catch (err) {
        sseSessions.delete(sessionId);
        const message = err instanceof Error ? err.message : String(err);
        process.stderr.write(
          `[Salla MCP HTTP] SSE connect error (${sessionId}): ${message}\n`
        );
        if (!res.headersSent) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: message }));
        } else {
          res.end();
        }
      }
      return;
    }

    // ── POST /messages — receive messages from SSE clients ────────────
    if (req.method === "POST" && url.pathname === "/messages") {
      const sessionId = url.searchParams.get("sessionId");

      if (!sessionId || !sseSessions.has(sessionId)) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid or missing sessionId" }));
        return;
      }

      try {
        const session = sseSessions.get(sessionId);
        if (!session) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Session expired" }));
          return;
        }

        await session.transport.handlePostMessage(req, res);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        process.stderr.write(`[Salla MCP HTTP] Message error: ${message}\n`);
        if (!res.headersSent) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: message }));
        }
      }
      return;
    }

    // ── 404 for everything else ────────────────────────────────────────
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        error: "Not found",
        available: ["/mcp", "/sse", "/messages", "/health"],
      })
    );
  });

  httpServer.on("error", onServerError);
  httpServer.listen(port, host, () => {
    process.stderr.write(
      `[Salla MCP HTTP] Server listening on ${host}:${port}\n`
    );
    process.stderr.write(
      `[Salla MCP HTTP] MCP endpoint: http://localhost:${port}/mcp\n`
    );
    process.stderr.write(
      `[Salla MCP HTTP] SSE endpoint: http://localhost:${port}/sse\n`
    );
    process.stderr.write(
      `[Salla MCP HTTP] Health check: http://localhost:${port}/health\n`
    );
  });

  return httpServer;
}
