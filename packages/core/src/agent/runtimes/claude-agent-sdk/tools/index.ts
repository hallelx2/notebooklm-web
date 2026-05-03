import { createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { parseLinkTool } from "./parse-link";
import { retrieveSourcesTool } from "./retrieve-sources";
import { webSearchTool } from "./web-search";

/**
 * Wraps every notebook tool into a single in-process MCP server that
 * the SDK can register via the `mcpServers` option. The SDK loads the
 * server, exposes its tools to the model under the configured name
 * prefix, and routes invocations back to our `handler` callbacks.
 *
 * Bound per-call because `retrieve_sources` needs the user/notebook
 * context. `web_search` and `parse_link` are stateless; they could
 * live in a singleton server, but keeping all three together keeps
 * registration simple.
 */
export function createNotebookMcpServer(opts: {
  userId: string;
  notebookId: string;
  sourceIds?: string[];
}) {
  return createSdkMcpServer({
    name: "notebook-tools",
    version: "0.1.0",
    tools: [
      retrieveSourcesTool(opts),
      webSearchTool,
      parseLinkTool,
    ],
    alwaysLoad: true,
  });
}

export { parseLinkTool, retrieveSourcesTool, webSearchTool };
