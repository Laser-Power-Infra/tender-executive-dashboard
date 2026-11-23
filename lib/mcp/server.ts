import "server-only";

import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { registerItemTools } from "./tools/items";
import { registerSupplyTools } from "./tools/supply";
import { registerTenderTools } from "./tools/tenders";

// Stateless: a fresh server per request, so tools hold no state between calls.
export const mcpHandler = createMcpHandler(() => {
  const server = new McpServer({ name: "tender-dashboard", version: "1.0.0" });
  registerItemTools(server);
  registerSupplyTools(server);
  registerTenderTools(server);
  return server;
});
