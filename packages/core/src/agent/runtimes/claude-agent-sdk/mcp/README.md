# MCP servers

Placeholder. The Claude Agent SDK speaks the [Model Context Protocol](https://modelcontextprotocol.io)
natively, so any MCP server (filesystem, database, web search, etc.) can be
plugged in via the `mcpServers:` option on `query()`.

Today's runtime only registers an in-process SDK server containing our
notebook-scoped tools (`retrieve_sources`, `web_search`, `parse_link`) — see
`../tools/index.ts -> createNotebookMcpServer`.

Phase 4 wires real MCP servers here so the SDK runtime can:

- Mount the user's `~/.claude.json` MCP servers (Postgres, GitHub, Slack, etc.)
  and let the research coordinator read from them.
- Mount per-notebook custom MCP servers configured via the settings UI.
- Forward `elicitation` requests (auth prompts) to the platform's UI surface
  rather than the SDK's default decline.

Each server gets its own file in this folder mirroring the layout of `../tools/`.
