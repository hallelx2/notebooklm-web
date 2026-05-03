import type {
  HookCallback,
  SessionStartHookInput,
  SyncHookJSONOutput,
} from "@anthropic-ai/claude-agent-sdk";

/**
 * SessionStart — fires when a new SDK session is initialized. Useful
 * for one-shot context injection at the very start (separate from
 * UserPromptSubmit which fires on every user turn).
 *
 * Currently a no-op pass-through that simply logs the start so we
 * can attribute usage / latency to the runtime in observability.
 * Wire something real once we have a logger plumbed through.
 */
export const sessionStartHook: HookCallback = async (
  input,
  _toolUseId,
  _options,
) => {
  const i = input as SessionStartHookInput;
  if (i.hook_event_name !== "SessionStart") {
    return { continue: true } as SyncHookJSONOutput;
  }
  // biome-ignore lint/suspicious/noConsoleLog: dev-only diagnostic
  console.log(
    `[claude-agent-sdk] session ${i.session_id} started (source=${i.source})`,
  );
  return { continue: true } as SyncHookJSONOutput;
};
