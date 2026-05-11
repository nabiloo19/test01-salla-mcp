import { spawn, ChildProcess } from "child_process";

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: number | string;
  method: string;
  params?: unknown;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number | string;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

interface McpTool {
  name: string;
  description?: string;
  inputSchema?: unknown;
}

/**
 * ApidogProxy
 *
 * Spawns the APIDog MCP server as a child process and forwards
 * JSON-RPC tool calls to it over stdio. This gives us the full
 * APIDog knowledge layer (all Salla docs, API specs, webhook
 * schemas) inside our own Salla MCP server.
 */
export class ApidogProxy {
  private process: ChildProcess | null = null;
  private buffer: string = "";
  private pendingRequests: Map<
    number | string,
    {
      resolve: (value: JsonRpcResponse) => void;
      reject: (reason: Error) => void;
    }
  > = new Map();
  private requestCounter: number = 1;
  private initialized: boolean = false;
  private tools: McpTool[] = [];
  private initPromise: Promise<void> | null = null;

  constructor(private siteId: string = "451700") {}

  /**
   * Start the APIDog child process and initialise the MCP session.
   * Safe to call multiple times — will only initialise once.
   */
  async init(): Promise<void> {
    if (this.initPromise) return this.initPromise;

    this.initPromise = this._doInit();
    return this.initPromise;
  }

  private async _doInit(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.process = spawn(
        "npx",
        ["-y", "apidog-mcp-server@latest", `--site-id=${this.siteId}`],
        {
          stdio: ["pipe", "pipe", "pipe"],
          env: { ...process.env },
        }
      );

      if (!this.process.stdout || !this.process.stdin) {
        reject(new Error("Failed to open APIDog process stdio"));
        return;
      }

      // Log APIDog stderr to our own stderr for debugging
      this.process.stderr?.on("data", (data: Buffer) => {
        process.stderr.write(`[APIDog] ${data.toString()}`);
      });

      this.process.on("error", (err) => {
        process.stderr.write(`[APIDog] Process error: ${err.message}\n`);
        reject(err);
      });

      this.process.on("exit", (code) => {
        process.stderr.write(`[APIDog] Process exited with code ${code}\n`);
        this.initialized = false;
        this.process = null;
      });

      // Parse newline-delimited JSON from APIDog stdout
      this.process.stdout.on("data", (data: Buffer) => {
        this.buffer += data.toString();
        const lines = this.buffer.split("\n");
        this.buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const msg = JSON.parse(trimmed) as JsonRpcResponse;
            this._handleResponse(msg);
          } catch {
            // not valid JSON, ignore
          }
        }
      });

      // Step 1: Send initialize request
      this._sendRaw({
        jsonrpc: "2.0",
        id: this.requestCounter++,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "salla-mcp-server", version: "1.0.0" },
        },
      })
        .then(() => {
          // Step 2: Send initialized notification
          this._notify({ jsonrpc: "2.0", method: "notifications/initialized" });

          // Step 3: Fetch available tools
          return this._sendRaw({
            jsonrpc: "2.0",
            id: this.requestCounter++,
            method: "tools/list",
            params: {},
          });
        })
        .then((response) => {
          const result = response.result as { tools?: McpTool[] } | undefined;
          this.tools = result?.tools ?? [];
          this.initialized = true;
          process.stderr.write(
            `[APIDog] Ready — ${this.tools.length} knowledge tools loaded\n`
          );
          resolve();
        })
        .catch(reject);
    });
  }

  /**
   * Returns all tools exposed by APIDog, prefixed with "knowledge__"
   * so they are clearly identifiable in the combined Salla MCP tool list.
   */
  getTools(): McpTool[] {
    return this.tools.map((t) => ({
      ...t,
      name: `knowledge__${t.name}`,
      description: `[Knowledge Layer] ${t.description ?? t.name}`,
    }));
  }

  /**
   * Forward a tool call to APIDog.
   * Strip the "knowledge__" prefix before forwarding.
   */
  async callTool(
    toolName: string,
    args: Record<string, unknown>
  ): Promise<unknown> {
    if (!this.initialized) await this.init();

    const actualName = toolName.replace(/^knowledge__/, "");

    const response = await this._sendRaw({
      jsonrpc: "2.0",
      id: this.requestCounter++,
      method: "tools/call",
      params: { name: actualName, arguments: args },
    });

    if (response.error) {
      throw new Error(
        `APIDog error: ${response.error.message} (code ${response.error.code})`
      );
    }

    return response.result;
  }

  /** Check whether a tool name belongs to the knowledge layer */
  isKnowledgeTool(toolName: string): boolean {
    return toolName.startsWith("knowledge__");
  }

  // ─── Internal helpers ────────────────────────────────────────────────────

  private _notify(msg: object): void {
    if (!this.process?.stdin) return;
    this.process.stdin.write(JSON.stringify(msg) + "\n");
  }

  private _sendRaw(msg: JsonRpcRequest): Promise<JsonRpcResponse> {
    return new Promise((resolve, reject) => {
      if (!this.process?.stdin) {
        reject(new Error("APIDog process not running"));
        return;
      }

      this.pendingRequests.set(msg.id, { resolve, reject });

      const timeout = setTimeout(() => {
        this.pendingRequests.delete(msg.id);
        reject(new Error(`APIDog request timed out: ${msg.method}`));
      }, 30000);

      this.pendingRequests.set(msg.id, {
        resolve: (val) => {
          clearTimeout(timeout);
          resolve(val);
        },
        reject: (err) => {
          clearTimeout(timeout);
          reject(err);
        },
      });

      this.process.stdin.write(JSON.stringify(msg) + "\n");
    });
  }

  private _handleResponse(msg: JsonRpcResponse): void {
    if (msg.id === undefined || msg.id === null) return;
    const pending = this.pendingRequests.get(msg.id);
    if (!pending) return;
    this.pendingRequests.delete(msg.id);
    pending.resolve(msg);
  }

  /** Gracefully shut down the APIDog child process */
  shutdown(): void {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
  }
}
