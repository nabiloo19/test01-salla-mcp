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
  mcpServer: Server,
  port: number = 3000
): http.Server {
  const transports = new Map<string, SSEServerTransport>();

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

      const transport = new SSEServerTransport("/messages", res);
      const sessionId = transport.sessionId;
      transports.set(sessionId, transport);

      res.on("close", () => {
        process.stderr.write(
          `[Salla MCP HTTP] SSE connection closed: ${sessionId}\n`
        );
        transports.delete(sessionId);
      });

      await mcpServer.connect(transport);
      return;
    }

    // ── POST /messages — receive messages from SSE clients ────────────
    if (req.method === "POST" && url.pathname === "/messages") {
      const sessionId = url.searchParams.get("sessionId");

      if (!sessionId || !transports.has(sessionId)) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid or missing sessionId" }));
        return;
      }

      let body = "";
      req.on("data", (chunk) => (body += chunk.toString()));
      req.on("end", async () => {
        try {
          const transport = transports.get(sessionId)!;
          await transport.handlePostMessage(req, res);
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

  httpServer.listen(port, () => {
    process.stderr.write(
      `[Salla MCP HTTP] Server listening on port ${port}\n`
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