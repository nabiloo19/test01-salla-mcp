/**
 * Salla Action Layer
 *
 * This is where all action tools live — tools that make real API calls
 * to the Salla Partner API on behalf of a partner.
 *
 * STATUS: Scaffold only. Tools will be added here once the tech team
 * provides the list of available Partner API endpoints.
 *
 * HOW TO ADD A TOOL:
 * 1. Add a new entry to the ACTION_TOOLS array (name, description, inputSchema)
 * 2. Add a matching case in executeActionTool() that calls the Salla Partner API
 * 3. That's it — the main server picks it up automatically
 *
 * PLANNED TOOLS (pending tech team endpoint list):
 * - list_apps              → GET /apps
 * - get_oauth_token_status → GET /apps/:id/token
 * - register_webhook       → POST /apps/:id/webhooks
 * - diagnose_app           → calls multiple endpoints, returns health report
 */

export interface ActionTool {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, object>;
    required?: string[];
  };
}

export interface ActionToolResult {
  content: Array<{
    type: "text";
    text: string;
  }>;
  isError?: boolean;
}

/**
 * All action tools are registered here.
 * Add new tools to this array as the tech team provides endpoints.
 */
export const ACTION_TOOLS: ActionTool[] = [
  // ─── TOOLS WILL BE ADDED HERE ─────────────────────────────────────────
  //
  // Example structure for reference:
  //
  // {
  //   name: "list_apps",
  //   description: "List all Salla apps for the authenticated partner, including their IDs, names, and current status.",
  //   inputSchema: {
  //     type: "object",
  //     properties: {},
  //     required: [],
  //   },
  // },
  //
  // {
  //   name: "get_oauth_token_status",
  //   description: "Check if the OAuth access token for a specific app is valid, when it expires, and whether the refresh token is still usable.",
  //   inputSchema: {
  //     type: "object",
  //     properties: {
  //       app_id: {
  //         type: "string",
  //         description: "The ID of the Salla app to check the token for",
  //       },
  //     },
  //     required: ["app_id"],
  //   },
  // },
  //
  // {
  //   name: "register_webhook",
  //   description: "Register a webhook for a specific event on a Salla app.",
  //   inputSchema: {
  //     type: "object",
  //     properties: {
  //       app_id: { type: "string", description: "The app ID" },
  //       event: { type: "string", description: "The webhook event name, e.g. order.created" },
  //       url: { type: "string", description: "The endpoint URL to send webhook events to" },
  //     },
  //     required: ["app_id", "event", "url"],
  //   },
  // },
  //
  // {
  //   name: "diagnose_app",
  //   description: "Run a full health check on a Salla app — token status, webhook coverage, subscription, App Store compliance.",
  //   inputSchema: {
  //     type: "object",
  //     properties: {
  //       app_id: { type: "string", description: "The app ID to diagnose" },
  //     },
  //     required: ["app_id"],
  //   },
  // },
  //
  // ──────────────────────────────────────────────────────────────────────
];

/**
 * Credentials loaded from environment variables.
 * Partners set these in their .env file.
 */
function getCredentials(): { clientId: string; clientSecret: string } {
  const clientId = process.env.SALLA_CLIENT_ID;
  const clientSecret = process.env.SALLA_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error(
      "Missing Salla credentials. Set SALLA_CLIENT_ID and SALLA_CLIENT_SECRET in your .env file."
    );
  }

  return { clientId, clientSecret };
}

/**
 * Execute an action tool call.
 * Add cases here as tools are added to ACTION_TOOLS above.
 */
export async function executeActionTool(
  toolName: string,
  args: Record<string, unknown>
): Promise<ActionToolResult> {
  // Validate credentials are present before any action
  try {
    getCredentials();
  } catch (err) {
    return {
      content: [
        {
          type: "text",
          text: [
            "⚠️ Salla credentials not configured.",
            "",
            "To use action tools, add your credentials to the .env file:",
            "  SALLA_CLIENT_ID=your_client_id",
            "  SALLA_CLIENT_SECRET=your_client_secret",
            "",
            "Get these from: https://partners.salla.com/apps",
          ].join("\n"),
        },
      ],
      isError: true,
    };
  }

  switch (toolName) {
    // ─── ADD TOOL CASES HERE AS THEY ARE BUILT ──────────────────────────
    //
    // case "list_apps": {
    //   const { clientId, clientSecret } = getCredentials();
    //   const response = await fetch("https://api.salla.dev/admin/v2/apps", {
    //     headers: { Authorization: `Bearer ${await getAccessToken(clientId, clientSecret)}` },
    //   });
    //   const data = await response.json();
    //   return {
    //     content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    //   };
    // }
    //
    // ────────────────────────────────────────────────────────────────────

    default:
      return {
        content: [
          {
            type: "text",
            text: `Unknown action tool: ${toolName}`,
          },
        ],
        isError: true,
      };
  }
}
