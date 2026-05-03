import type {
  HookCallback,
  PreToolUseHookInput,
  SyncHookJSONOutput,
} from "@anthropic-ai/claude-agent-sdk";

/**
 * PreToolUse — fires BEFORE every tool execution. Returning a
 * `permissionDecision: "deny"` blocks the call; "allow" lets it
 * through; missing decision leaves the SDK's default in place.
 *
 * Use cases:
 *   - Block `web_search` when the user disabled deep mode (so the
 *     coordinator doesn't burn time/tokens on the open web for a
 *     "fast" research run).
 *   - Block `parse_link` for URLs outside an allow-list (future).
 *   - Annotate the call with extra metadata (additionalContext) the
 *     model uses to make better tool decisions.
 */
export function makePreToolUseHook(opts: {
  /** When false, web_search calls return a deny decision. */
  allowWebSearch: boolean;
}): HookCallback {
  return async (input, _toolUseId, _options) => {
    const i = input as PreToolUseHookInput;
    if (i.hook_event_name !== "PreToolUse") {
      return { continue: true } as SyncHookJSONOutput;
    }

    if (i.tool_name === "web_search" && !opts.allowWebSearch) {
      return {
        continue: true,
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "deny",
          permissionDecisionReason:
            "web_search is disabled for this run (fast mode).",
        },
      } as SyncHookJSONOutput;
    }

    return { continue: true } as SyncHookJSONOutput;
  };
}
