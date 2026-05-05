import { z } from "zod";
import { protectedProcedure, router } from "../context";

/**
 * Runtime detection for the onboarding wizard.
 *
 * Surfaces "we found this on your machine, want to use it?" cards
 * before forcing the user to paste an API key. Today this only
 * probes Ollama; future work adds Claude Code, Codex CLI, and
 * `gh copilot` (the four runtime stubs already in
 * packages/core/src/agent/types.ts).
 *
 * Detection happens in the desktop adapter's process — never on the
 * web deployment, where probing localhost makes no sense (the user's
 * machine isn't the same as the server).
 */

const OllamaProbeSchema = z.object({
  /** Override the URL we probe. Default localhost:11434. */
  baseUrl: z.string().url().optional(),
});

const OllamaModel = z.object({
  name: z.string(),
  modifiedAt: z.string().optional(),
  size: z.number().optional(),
  digest: z.string().optional(),
});

const OllamaProbeResult = z.object({
  ok: z.boolean(),
  baseUrl: z.string().url().optional(),
  /** The list of models the user has pulled. Empty array = installed but no models yet. */
  models: z.array(OllamaModel),
  /** When ok=false, this explains why. */
  error: z.string().optional(),
  /** ms to round-trip — useful UI hint. */
  latencyMs: z.number().optional(),
});

export const runtimesRouter = router({
  /**
   * Probe a local Ollama server. Hits `/api/tags` (the canonical
   * "list pulled models" endpoint) with a tight timeout. Returns:
   *
   *   { ok: true, models: [...] }              — Ollama running, models pulled
   *   { ok: true, models: [] }                  — Ollama running, nothing pulled yet
   *   { ok: false, error: "ECONNREFUSED" }      — Ollama not running
   *
   * Never throws — the wizard renders different UI per outcome and
   * the absence of Ollama is the most common case, not an error.
   */
  detectOllama: protectedProcedure
    .input(OllamaProbeSchema.optional())
    .output(OllamaProbeResult)
    .query(async ({ input }) => {
      const baseUrl =
        input?.baseUrl?.replace(/\/+$/, "") ?? "http://localhost:11434";
      const url = `${baseUrl}/api/tags`;
      const start = Date.now();
      try {
        const res = await fetch(url, {
          signal: AbortSignal.timeout(2500),
          headers: { Accept: "application/json" },
        });
        if (!res.ok) {
          return {
            ok: false,
            baseUrl,
            models: [],
            error: `Ollama responded ${res.status} ${res.statusText}`,
          };
        }
        const body = (await res.json()) as {
          models?: {
            name: string;
            modified_at?: string;
            size?: number;
            digest?: string;
          }[];
        };
        const models = (body.models ?? []).map((m) => ({
          name: m.name,
          modifiedAt: m.modified_at,
          size: m.size,
          digest: m.digest,
        }));
        return {
          ok: true,
          baseUrl,
          models,
          latencyMs: Date.now() - start,
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          ok: false,
          baseUrl,
          models: [],
          // Tighten common network-failure messages so the UI can show
          // an actionable hint instead of a confusing dump.
          error:
            /ECONNREFUSED|fetch failed|connect/i.test(msg)
              ? "Ollama isn't running on this machine. Install it from ollama.com or `ollama serve` if you already have it."
              : /timeout|abort/i.test(msg)
                ? "Ollama responded too slowly (>2.5s)."
                : msg,
        };
      }
    }),
});
