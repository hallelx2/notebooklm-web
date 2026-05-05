import { spawn } from "node:child_process";
import { z } from "zod";
import { protectedProcedure, router } from "../context";

/**
 * Runtime detection for the onboarding wizard.
 *
 * Surfaces "we found this on your machine — use it directly, no API key
 * needed" options before forcing the user to paste a key. Two families:
 *
 *   1. Local model server: Ollama, probed via HTTP at /api/tags.
 *   2. Coding agents: subprocess CLIs (`claude`, `codex`, `gh copilot`).
 *      We spawn each with `--version` (or `gh extension list`) and key
 *      off the exit code + stdout.
 *
 * Detection happens in the desktop adapter's process — never on the
 * deployed web app, where probing localhost or running CLIs makes no
 * sense (the server isn't the user's machine). The wizard renders
 * "not detected" branches gracefully, so a web-mode user just sees
 * the API-key path.
 *
 * Every probe has a tight per-probe timeout (2.5s for HTTP, 4s for
 * subprocess spawns) and never throws — the absence of any one tool
 * is the dominant case, not an error.
 */

/* ------------------------------------------------------------------ */
/*  Schemas                                                             */
/* ------------------------------------------------------------------ */

const OllamaModel = z.object({
  name: z.string(),
  modifiedAt: z.string().optional(),
  size: z.number().optional(),
  digest: z.string().optional(),
});

const OllamaProbeResult = z.object({
  ok: z.boolean(),
  baseUrl: z.string().url().optional(),
  models: z.array(OllamaModel),
  error: z.string().optional(),
  latencyMs: z.number().optional(),
});

const CliProbeResult = z.object({
  ok: z.boolean(),
  /** First-line of `--version` output, e.g. "claude 1.0.42". */
  version: z.string().optional(),
  /** When ok=false, this explains why. */
  error: z.string().optional(),
  /** ms the probe took. */
  latencyMs: z.number().optional(),
});

const DetectAvailableInput = z.object({
  ollamaBaseUrl: z.string().url().optional(),
});

const DetectAvailableResult = z.object({
  ollama: OllamaProbeResult,
  claude: CliProbeResult,
  codex: CliProbeResult,
  ghCopilot: CliProbeResult,
});

/* ------------------------------------------------------------------ */
/*  Probe helpers                                                       */
/* ------------------------------------------------------------------ */

async function probeOllama(
  baseUrlIn: string | undefined,
): Promise<z.infer<typeof OllamaProbeResult>> {
  const baseUrl = baseUrlIn?.replace(/\/+$/, "") ?? "http://localhost:11434";
  const start = Date.now();
  try {
    const res = await fetch(`${baseUrl}/api/tags`, {
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
    return {
      ok: true,
      baseUrl,
      models: (body.models ?? []).map((m) => ({
        name: m.name,
        modifiedAt: m.modified_at,
        size: m.size,
        digest: m.digest,
      })),
      latencyMs: Date.now() - start,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      baseUrl,
      models: [],
      error:
        /ECONNREFUSED|fetch failed|connect/i.test(msg)
          ? "Ollama isn't running on this machine. Install it from ollama.com or `ollama serve` if you already have it."
          : /timeout|abort/i.test(msg)
            ? "Ollama responded too slowly (>2.5s)."
            : msg,
    };
  }
}

/**
 * Spawn `cmd args...` with a 4s timeout. Resolve with combined stdout
 * + stderr text (first 4KB) and the exit code. Used by every CLI
 * probe below — keeps the timing + escape behaviour consistent.
 */
function execProbe(
  cmd: string,
  args: string[],
): Promise<{ ok: boolean; output: string; code: number | null; latencyMs: number }> {
  return new Promise((resolve) => {
    const start = Date.now();
    let stdout = "";
    let stderr = "";
    let settled = false;
    const child = spawn(cmd, args, {
      windowsHide: true,
      // shell:true on Windows lets us find .cmd shims (npm-installed
      // CLIs like `claude`, `codex` resolve to .cmd on Windows). On
      // *nix it's a no-op-ish; the binary is found via PATH either way.
      shell: process.platform === "win32",
    });
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        try {
          child.kill();
        } catch {}
        resolve({
          ok: false,
          output: stderr || stdout || "timed out",
          code: null,
          latencyMs: Date.now() - start,
        });
      }
    }, 4000);
    child.stdout?.on("data", (d) => {
      if (stdout.length < 4096) stdout += String(d);
    });
    child.stderr?.on("data", (d) => {
      if (stderr.length < 4096) stderr += String(d);
    });
    child.on("error", (err) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve({
          ok: false,
          // ENOENT here means "binary not on PATH" — the canonical
          // "user doesn't have this installed" signal we want.
          output: err.message,
          code: null,
          latencyMs: Date.now() - start,
        });
      }
    });
    child.on("close", (code) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve({
          ok: code === 0,
          output: stdout || stderr,
          code,
          latencyMs: Date.now() - start,
        });
      }
    });
  });
}

async function probeCli(
  cmd: string,
  args: string[],
  notInstalledHint: string,
): Promise<z.infer<typeof CliProbeResult>> {
  const r = await execProbe(cmd, args);
  if (r.ok) {
    return {
      ok: true,
      version: r.output.trim().split("\n")[0]?.slice(0, 200),
      latencyMs: r.latencyMs,
    };
  }
  return {
    ok: false,
    error: /ENOENT|not found|cannot find/i.test(r.output)
      ? notInstalledHint
      : r.output.trim().slice(0, 240) || `exit ${r.code}`,
    latencyMs: r.latencyMs,
  };
}

/**
 * `gh copilot` is a *gh extension*, not a top-level binary. The right
 * probe is `gh extension list` and looking for `github/gh-copilot` in
 * the output. A naive `gh copilot --version` also works on most
 * versions but fails non-zero when the extension isn't installed
 * even though `gh` itself is — slightly noisier output, still works.
 */
async function probeGhCopilot(): Promise<z.infer<typeof CliProbeResult>> {
  // First check `gh` is on PATH at all. Saves an extension-list spawn
  // when the user doesn't have GitHub CLI.
  const ghVer = await execProbe("gh", ["--version"]);
  if (!ghVer.ok) {
    return {
      ok: false,
      error:
        "GitHub CLI (`gh`) is not installed. Install it from cli.github.com to use Copilot here.",
      latencyMs: ghVer.latencyMs,
    };
  }
  const list = await execProbe("gh", ["extension", "list"]);
  if (!list.ok) {
    return {
      ok: false,
      error: list.output.trim().slice(0, 240) || "gh extension list failed",
      latencyMs: list.latencyMs,
    };
  }
  if (!/github\/gh-copilot/i.test(list.output)) {
    return {
      ok: false,
      error:
        "Copilot extension not installed for `gh`. Run `gh extension install github/gh-copilot` to enable.",
      latencyMs: list.latencyMs,
    };
  }
  return {
    ok: true,
    version:
      list.output.trim().split("\n").find((l) => /gh-copilot/i.test(l))?.trim() ??
      "gh-copilot",
    latencyMs: list.latencyMs,
  };
}

/* ------------------------------------------------------------------ */
/*  Router                                                              */
/* ------------------------------------------------------------------ */

export const runtimesRouter = router({
  /**
   * One-shot detection — Ollama + the three coding-agent CLIs in
   * parallel. The wizard calls this once on mount and renders cards
   * for whatever it found.
   */
  detectAvailable: protectedProcedure
    .input(DetectAvailableInput.optional())
    .output(DetectAvailableResult)
    .query(async ({ input }) => {
      const [ollama, claude, codex, ghCopilot] = await Promise.all([
        probeOllama(input?.ollamaBaseUrl),
        probeCli(
          "claude",
          ["--version"],
          "Claude Code CLI not installed. Get it from claude.ai/code.",
        ),
        probeCli(
          "codex",
          ["--version"],
          "Codex CLI not installed. Run `npm i -g @openai/codex`.",
        ),
        probeGhCopilot(),
      ]);
      return { ollama, claude, codex, ghCopilot };
    }),

  /**
   * @deprecated Use `detectAvailable` — this is a thin shim kept for
   * any older client that hasn't refreshed the tRPC types yet.
   */
  detectOllama: protectedProcedure
    .input(z.object({ baseUrl: z.string().url().optional() }).optional())
    .output(OllamaProbeResult)
    .query(({ input }) => probeOllama(input?.baseUrl)),
});
