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
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";

export function startHttpServer(
  createMcpServer: () => Server,
  port: number = 3000
): http.Server {
  const host = "0.0.0.0";
  const sessions = new Map<
    string,
    { server: Server; transport: SSEServerTransport }
  >();
  const onServerError = (err: NodeJS.ErrnoException) => {
    const message = err.message || String(err);
    process.stderr.write(`[Salla MCP HTTP] Listen error: ${message}\n`);
  };

  const httpServer = http.createServer(async (req, res) => {
    // ── CORS headers — required for browser-based clients ──────────────
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization"
    );

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

    // ── GET /sse — SSE stream for Claude.ai and Lovable ───────────────
    if (req.method === "GET" && url.pathname === "/sse") {
      process.stderr.write("[Salla MCP HTTP] New SSE connection\n");

      const server = createMcpServer();
      const transport = new SSEServerTransport("/messages", res);
      const sessionId = transport.sessionId;

      sessions.set(sessionId, { server, transport });

      res.on("close", () => {
        process.stderr.write(
          `[Salla MCP HTTP] SSE connection closed: ${sessionId}\n`
        );
        sessions.delete(sessionId);

        const closableServer = server as Server & {
          close?: () => Promise<void> | void;
        };
        void Promise.resolve(closableServer.close?.()).catch((err) => {
          const message = err instanceof Error ? err.message : String(err);
          process.stderr.write(
            `[Salla MCP HTTP] Server close error (${sessionId}): ${message}\n`
          );
        });
      });

      try {
        await server.connect(transport);
      } catch (err) {
        sessions.delete(sessionId);
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

      if (!sessionId || !sessions.has(sessionId)) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid or missing sessionId" }));
        return;
      }

      let body = "";
      req.on("data", (chunk) => (body += chunk.toString()));
      req.on("end", async () => {
        try {
          const session = sessions.get(sessionId);
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
      });
      return;
    }

    // ── 404 for everything else ────────────────────────────────────────
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        error: "Not found",
        available: ["/sse", "/messages", "/health"],
      })
    );
  });

  httpServer.on("error", onServerError);
  httpServer.listen(port, host, () => {
    process.stderr.write(
      `[Salla MCP HTTP] Server listening on ${host}:${port}\n`
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
