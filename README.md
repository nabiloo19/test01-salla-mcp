# Salla MCP Server

One server. Two layers. Every Salla partner unblocked.

The Salla MCP Server connects any AI assistant — Claude, Cursor, ChatGPT, and more — directly to the Salla Partner ecosystem. Partners get instant answers to any Salla question and, once action tools are enabled, the ability to manage their apps without leaving their AI assistant.

---

## What It Does

### 🧠 Knowledge Layer (live now)
Powered by APIDog. Claude already knows everything about Salla:
- Full Partner API reference
- OAuth 2.0 flow, token lifecycle, refresh rules
- All 40+ webhook event schemas and payloads
- App Store review checklist and requirements
- Production-ready code examples in TypeScript, PHP, Python
- All Salla developer guides and articles

### ⚡ Action Layer (coming soon)
Direct Salla Partner API calls. Partners will be able to:
- `list_apps` — see all their apps and status
- `get_oauth_token_status` — check token validity
- `register_webhook` — set up webhooks
- `diagnose_app` — full health check with fixes

---

## Requirements

- **Node.js 18 or later** — [Download here](https://nodejs.org)
- **npm** (comes with Node.js)
- **Internet access** (APIDog fetches Salla docs on first run)

Check your Node.js version:
```bash
node --version
# Should print v18.x.x or higher
```

---

## Installation

### Step 1 — Clone the repository

```bash
git clone https://github.com/your-org/salla-mcp-server.git
cd salla-mcp-server
```

### Step 2 — Install dependencies

```bash
npm install
```

### Step 3 — Set up environment variables

```bash
cp .env.example .env
```

Open `.env` and fill in your values. For the knowledge layer only, the defaults are fine — no credentials needed.

```env
APIDOG_SITE_ID=451700

# Only needed when action tools are enabled:
SALLA_CLIENT_ID=
SALLA_CLIENT_SECRET=
```

### Step 4 — Build the server

```bash
npm run build
```

This compiles TypeScript to JavaScript in the `dist/` folder.

### Step 5 — Test it locally

```bash
npm start
```

You should see:
```
[Salla MCP] Starting salla-mcp-server v1.0.0
[Salla MCP] APIDog site ID: 451700
[Salla MCP] Action tools: none yet (TBD with tech team)
[Salla MCP] Server running — waiting for tool calls
```

Press `Ctrl+C` to stop. If you see this output, your server is working correctly.

---

## Adding to Claude Desktop

Claude Desktop is the easiest way to test the server locally.

### Step 1 — Find your config file

| OS | Location |
|---|---|
| macOS | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Windows | `%APPDATA%\Claude\claude_desktop_config.json` |
| Linux | `~/.config/Claude/claude_desktop_config.json` |

### Step 2 — Add the server config

Open the file (create it if it doesn't exist) and add:

```json
{
  "mcpServers": {
    "salla": {
      "command": "node",
      "args": ["/absolute/path/to/salla-mcp-server/dist/index.js"]
    }
  }
}
```

Replace `/absolute/path/to/salla-mcp-server` with the real path on your machine.

**macOS/Linux example:**
```json
{
  "mcpServers": {
    "salla": {
      "command": "node",
      "args": ["/Users/yourname/projects/salla-mcp-server/dist/index.js"]
    }
  }
}
```

**Windows example:**
```json
{
  "mcpServers": {
    "salla": {
      "command": "node",
      "args": ["C:\\Users\\yourname\\projects\\salla-mcp-server\\dist\\index.js"]
    }
  }
}
```

### Step 3 — Restart Claude Desktop

Fully quit and reopen Claude Desktop. You should see a tools icon (🔧) in the chat bar — that confirms the server is connected.

### Step 4 — Test it

Type in Claude:
```
What can you help me with for Salla?
```

---

## Adding to Cursor

### Step 1 — Open Cursor settings

Go to: `Cursor → Settings → Cursor Settings → MCP`

Or open your Cursor MCP config file directly:

| OS | Location |
|---|---|
| macOS | `~/.cursor/mcp.json` |
| Windows | `%APPDATA%\Cursor\mcp.json` |
| Linux | `~/.cursor/mcp.json` |

### Step 2 — Add the server config

```json
{
  "mcpServers": {
    "salla": {
      "command": "node",
      "args": ["/absolute/path/to/salla-mcp-server/dist/index.js"]
    }
  }
}
```

### Step 3 — Restart Cursor

Fully quit and reopen. Open a chat panel and type:
```
What can you help me with for Salla?
```

---

## Adding to VS Code (with Continue or Cline)

### Using Continue

Open your Continue config at `~/.continue/config.json` and add:

```json
{
  "mcpServers": [
    {
      "name": "salla",
      "command": "node",
      "args": ["/absolute/path/to/salla-mcp-server/dist/index.js"]
    }
  ]
}
```

### Using Cline

Open the Cline extension settings and add the MCP server under "MCP Servers":

```json
{
  "mcpServers": {
    "salla": {
      "command": "node",
      "args": ["/absolute/path/to/salla-mcp-server/dist/index.js"]
    }
  }
}
```

---

## Adding to Claude.ai (Custom Connector)

> This requires a Claude Pro, Team, or Enterprise plan.

### Step 1 — Deploy the server

The server must be publicly accessible over HTTP/HTTPS to connect to Claude.ai. See the [Deployment](#deployment) section below.

### Step 2 — Add as a connector

1. Go to [claude.ai](https://claude.ai)
2. Click your profile → **Settings** → **Integrations**
3. Click **Add Integration**
4. Enter your deployed server URL
5. Click **Connect**

### Step 3 — Test it

Start a new conversation and type:
```
What can you help me with for Salla?
```

---

## Adding to ChatGPT (via GPT Actions)

ChatGPT uses a different protocol (OpenAPI/REST) rather than MCP natively. To connect:

### Option A — Use a bridge (recommended for now)
Tools like [mcp-bridge](https://github.com/secretiverhino/mcp-bridge) can expose an MCP server as a REST API that ChatGPT Actions can call. This is the fastest path.

### Option B — Deploy as an HTTP server
Convert the action layer to a REST API and register it as a GPT Action with a custom OpenAPI spec. This is more work but gives the cleanest ChatGPT integration.

For now, Claude Desktop and Cursor are the fastest ways to test.

---

## Adding to Lovable

Lovable supports MCP servers for AI-assisted development. 

### Step 1 — Deploy the server (required)
Lovable needs a publicly accessible URL. See [Deployment](#deployment) below.

### Step 2 — Connect in Lovable
1. Open your Lovable project
2. Go to **Settings → Integrations → MCP**
3. Add your deployed server URL
4. Click **Connect**

---

## Deployment

To use the server with Claude.ai, Lovable, or any cloud-based tool, deploy it to a server with a public URL.

### Option A — Railway (easiest, free tier available)

1. Push your code to GitHub
2. Go to [railway.app](https://railway.app) and create a new project
3. Connect your GitHub repo
4. Set environment variables in the Railway dashboard:
   - `APIDOG_SITE_ID=451700`
   - `HTTP_MODE=true`
   - `SALLA_CLIENT_ID=` (when ready)
   - `SALLA_CLIENT_SECRET=` (when ready)
   - Do not set `PORT` manually; Railway injects it at runtime
5. Railway will give you a public URL like `https://salla-mcp-server.up.railway.app`

### Option B — Render (free tier available)

1. Push to GitHub
2. Go to [render.com](https://render.com) and create a **Web Service**
3. Connect your repo
4. Set build command: `npm install && npm run build`
5. Set start command: `npm start`
6. Add environment variables:
   - `APIDOG_SITE_ID=451700`
   - `HTTP_MODE=true`
   - Leave `PORT` unset unless your platform requires a fixed value
7. Deploy

### Option C — Your own VPS

```bash
# On your server
git clone https://github.com/your-org/salla-mcp-server.git
cd salla-mcp-server
npm install
npm run build
cp .env.example .env
# Edit .env with your values
npm start
```

Use nginx or Caddy as a reverse proxy to expose it on port 80/443.

---

## Project Structure

```
salla-mcp-server/
├── src/
│   ├── index.ts          # Main server — routes all tool calls
│   ├── proxy/
│   │   └── apidog.ts     # APIDog proxy — knowledge layer
│   └── actions/
│       └── index.ts      # Action layer — Salla API tools (TBD)
├── dist/                 # Compiled output (after npm run build)
├── .env.example          # Environment variable template
├── .env                  # Your local config (never commit this)
├── package.json
├── tsconfig.json
└── README.md
```

---

## Adding Action Tools (Tech Team Guide)

When the tech team provides the Partner API endpoint list, adding a new action tool is straightforward.

### Step 1 — Add the tool definition

In `src/actions/index.ts`, add to the `ACTION_TOOLS` array:

```typescript
{
  name: "list_apps",
  description: "List all Salla apps for the authenticated partner, including their IDs, names, and current status.",
  inputSchema: {
    type: "object",
    properties: {},
    required: [],
  },
},
```

### Step 2 — Add the implementation

In the same file, add a case to `executeActionTool()`:

```typescript
case "list_apps": {
  const { clientId, clientSecret } = getCredentials();
  const accessToken = await getAccessToken(clientId, clientSecret);
  const response = await fetch("https://api.salla.dev/admin/v2/apps", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await response.json();
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
  };
}
```

### Step 3 — Rebuild

```bash
npm run build
```

That's it. The new tool is automatically available to any connected AI assistant.

---

## Troubleshooting

### "APIDog failed to initialise"
- Make sure you have Node.js 18+
- Make sure you have internet access
- Run `npx apidog-mcp-server@latest --site-id=451700` directly to test APIDog in isolation

### "Cannot find module" errors
- Run `npm run build` again
- Make sure you ran `npm install` first

### Claude Desktop doesn't show the tools icon
- Make sure the path in `claude_desktop_config.json` is absolute, not relative
- Make sure you fully quit and reopened Claude Desktop (not just closed the window)
- Check that `npm run build` completed without errors

### Tools appear but return errors
- Check the `.env` file exists and has the right values
- Run `npm start` in your terminal and look at the stderr output for clues

---

## Changelog

### v1.0.0
- Knowledge layer via APIDog proxy (site-id: 451700)
- Action layer scaffold ready for tools
- Compatible with Claude Desktop, Cursor, VS Code, Claude.ai, Lovable

---

## What's Next

Once the tech team provides the Partner API endpoint list:
1. Add `list_apps`
2. Add `get_oauth_token_status`
3. Add `register_webhook`
4. Add `diagnose_app`

Each tool takes less than a day to add and test.
