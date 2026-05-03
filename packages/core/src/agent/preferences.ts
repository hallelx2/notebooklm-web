import { eq } from "drizzle-orm";
import { z } from "zod";
import { userAiConfig } from "../db/schema";
import { coreDb } from "../runtime";
import type { AgentRuntime, AgentRuntimeId, AgentTaskKind } from "./types";

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
 *
 * Defaults:
 *   - `chat`, `rerank`, `studio`: `["ai-sdk"]` — the universal fallback
 *     that supports every BYOK provider.
 *   - `research`: `["claude-agent-sdk", "ai-sdk"]` — Claude Agent SDK's
 *     native sub-agents replace the AI SDK runtime's manual 9-phase
 *     loop when available; ai-sdk takes over for everyone else
 *     (falls back automatically when the SDK runtime's strict
 *     `available()` check fails).
 */
export const RuntimePreferencesSchema = z.object({
  chat: z.array(z.string()).default(["ai-sdk"]),
  rerank: z.array(z.string()).default(["ai-sdk"]),
  research: z.array(z.string()).default(["claude-agent-sdk", "ai-sdk"]),
  studio: z.array(z.string()).default(["ai-sdk"]),
});

export type RuntimePreferences = z.infer<typeof RuntimePreferencesSchema>;

/**
 * Parse a `userAiConfig.preferences` jsonb blob safely. Anything missing
 * or malformed falls back to the schema defaults — preserves the
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

/**
 * Convenience helper handlers and core utilities use to load + parse +
 * shape a user's prefs into the `AgentRuntime[]` form `runAgent` wants.
 *
 * Single indexed lookup against `user_ai_config`; not currently cached
 * because the rows are tiny and prefs change rarely. If this turns up
 * in profiling, drop in a per-user TTL cache mirrored on
 * `invalidateUserAiCache` from `ai/factory.ts`.
 */
export async function loadRuntimesForTask(
  userId: string,
  taskKind: AgentTaskKind,
): Promise<AgentRuntime[]> {
  const db = coreDb();
  const [row] = await db
    .select({ preferences: userAiConfig.preferences })
    .from(userAiConfig)
    .where(eq(userAiConfig.userId, userId))
    .limit(1);
  const prefs = readRuntimePreferences(row?.preferences);
  return preferencesForTask(prefs, taskKind).map(
    (id) => ({ id }) as AgentRuntime,
  );
}
