import { z } from "zod";
import type { AgentRuntimeId, AgentTaskKind } from "./types";

/**
 * Per-task runtime preference, persisted on `userAiConfig.preferences`
 * (jsonb — no schema migration needed). Each list is an ordered fallback
 * chain handed to `runAgent`; the harness picks the first registered
 * adapter that supports + is available for the task.
 *
 * Runtime IDs are stored as plain strings rather than the union type so
 * a user can save preferences for a runtime that's defined but not yet
 * registered in the running build (forward-compat for pulling settings
 * from a newer client onto an older server).
 */
export const RuntimePreferencesSchema = z.object({
  chat: z.array(z.string()).default(["ai-sdk"]),
  rerank: z.array(z.string()).default(["ai-sdk"]),
  research: z.array(z.string()).default(["ai-sdk"]),
  studio: z.array(z.string()).default(["ai-sdk"]),
});

export type RuntimePreferences = z.infer<typeof RuntimePreferencesSchema>;

/**
 * Parse a `userAiConfig.preferences` jsonb blob safely. Anything missing
 * or malformed falls back to `["ai-sdk"]` for every task — preserves the
 * pre-harness behaviour for users who never opened a runtime settings UI.
 */
export function readRuntimePreferences(prefs: unknown): RuntimePreferences {
  const parsed = RuntimePreferencesSchema.safeParse(prefs ?? {});
  return parsed.success ? parsed.data : RuntimePreferencesSchema.parse({});
}

/**
 * Pull the prefs list for a specific task. The harness's `runAgent` takes
 * `AgentRuntime[]`, so callers wrap each id in `{ id }`.
 */
export function preferencesForTask(
  prefs: RuntimePreferences,
  taskKind: AgentTaskKind,
): AgentRuntimeId[] {
  return prefs[taskKind] as AgentRuntimeId[];
}
