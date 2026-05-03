import type {
  AgentAdapter,
  AgentContext,
  AgentEvent,
  AgentRuntime,
  AgentRuntimeId,
  AgentTask,
} from "./types";

/**
 * Adapter registry. Each runtime calls `registerAdapter` at module load
 * (typically from its own `index.ts`); the harness reads from this map at
 * dispatch time. A registry rather than a static import means the desktop
 * and the web can both register the same set, and tests can register
 * mocks without touching production code.
 */
const adapters = new Map<AgentRuntimeId, AgentAdapter>();

export function registerAdapter(adapter: AgentAdapter): void {
  adapters.set(adapter.id, adapter);
}

export function getAdapter(id: AgentRuntimeId): AgentAdapter | undefined {
  return adapters.get(id);
}

export function listRegisteredAdapters(): AgentRuntimeId[] {
  return [...adapters.keys()];
}

/**
 * Walk the caller's preference list, return the first adapter that
 * is registered, supports the task, AND reports itself available.
 *
 * Errors thrown during `adapter.run(...)` are NOT caught here — they
 * propagate to the caller. This is deliberate: silent fallback on a
 * thrown error is a footgun (e.g. a 503 from Anthropic getting masked
 * as "ai-sdk reply"). Callers who want retry semantics wrap `runAgent`
 * themselves.
 */
export async function* runAgent(
  task: AgentTask,
  preferences: AgentRuntime[],
  ctx: AgentContext,
): AsyncIterable<AgentEvent> {
  const tried: string[] = [];
  for (const pref of preferences) {
    const adapter = adapters.get(pref.id);
    if (!adapter) {
      tried.push(`${pref.id}:not-registered`);
      continue;
    }
    if (!adapter.supports(task)) {
      tried.push(`${pref.id}:unsupported(${task.kind})`);
      continue;
    }
    if (!(await adapter.available(ctx))) {
      tried.push(`${pref.id}:unavailable`);
      continue;
    }
    yield { type: "step", label: `runtime:${pref.id}` };
    yield* adapter.run(task, ctx);
    return;
  }
  throw new Error(
    `Agent harness: no runtime available for task "${task.kind}". ` +
      `Tried: ${tried.length ? tried.join(", ") : "(empty preference list)"}. ` +
      `Registered adapters: ${listRegisteredAdapters().join(", ") || "(none)"}.`,
  );
}
