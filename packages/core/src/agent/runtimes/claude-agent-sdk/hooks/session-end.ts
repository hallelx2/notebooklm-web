import type { HookCallback, SyncHookJSONOutput } from "@anthropic-ai/claude-agent-sdk";

/**
 * SessionEnd — fires when an SDK session terminates (success, abort,
 * or error). Currently logs only; future use is observability —
 * record total tokens, duration, and cost into a `runs` table the
 * settings page can summarise.
 */
export const sessionEndHook: HookCallback = async (
  input,
  _toolUseId,
  _options,
) => {
  const i = input as { session_id: string; hook_event_name: string };
  if (i.hook_event_name !== "SessionEnd") {
    return { continue: true } as SyncHookJSONOutput;
  }
  // biome-ignore lint/suspicious/noConsoleLog: dev-only diagnostic
  console.log(`[claude-agent-sdk] session ${i.session_id} ended`);
  return { continue: true } as SyncHookJSONOutput;
};
