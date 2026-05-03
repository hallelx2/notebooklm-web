import type {
  HookCallback,
  SyncHookJSONOutput,
  UserPromptSubmitHookInput,
} from "@anthropic-ai/claude-agent-sdk";

/**
 * UserPromptSubmit — fires when a user prompt is submitted. Returning
 * `additionalContext` injects a string into the system context for the
 * upcoming turn without altering the user's visible message.
 *
 * Use case: at the start of a research task, inject a summary of the
 * notebook's existing sources so the coordinator knows what it doesn't
 * need to look up. Avoids the redundancy that comes from the user
 * asking about a topic they already have detailed notes on.
 */
export function makeUserPromptSubmitHook(opts: {
  existingContext: string;
}): HookCallback {
  return async (input, _toolUseId, _options) => {
    const i = input as UserPromptSubmitHookInput;
    if (i.hook_event_name !== "UserPromptSubmit") {
      return { continue: true } as SyncHookJSONOutput;
    }
    if (!opts.existingContext.trim()) {
      return { continue: true } as SyncHookJSONOutput;
    }

    return {
      continue: true,
      hookSpecificOutput: {
        hookEventName: "UserPromptSubmit",
        additionalContext: `Notebook already contains these sources (avoid duplicating):\n${opts.existingContext}`,
      },
    } as SyncHookJSONOutput;
  };
}
