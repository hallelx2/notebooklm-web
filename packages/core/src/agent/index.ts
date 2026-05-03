/**
 * Public API for the agent harness.
 *
 *   import { runAgent, registerAdapter, type AgentTask } from "@notebooklm/core/agent";
 *   import { readRuntimePreferences } from "@notebooklm/core/agent/preferences";
 *
 * Runtime adapters live under `runtimes/<id>/index.ts`. Each registers
 * itself by calling `registerAdapter(adapter)` at module load. The
 * `packages/core/src/agent/runtimes/index.ts` barrel imports each
 * adapter for its side-effect, so importing `@notebooklm/core/agent`
 * loads the registry.
 */
export type {
  AgentAdapter,
  AgentContext,
  AgentEvent,
  AgentRuntime,
  AgentRuntimeId,
  AgentTask,
  AgentTaskKind,
  StudioOutputKind,
} from "./types";

export {
  getAdapter,
  listRegisteredAdapters,
  registerAdapter,
  runAgent,
} from "./harness";

export {
  loadRuntimesForTask,
  preferencesForTask,
  readRuntimePreferences,
  type RuntimePreferences,
  RuntimePreferencesSchema,
} from "./preferences";
