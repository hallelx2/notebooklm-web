import { loadRuntimesForTask, runAgent } from "@notebooklm/core/agent";
import { NoAiConfigError } from "@notebooklm/core/ai/factory";
import { pMap, withRetry } from "@notebooklm/core/concurrency";
import { notebooks, sources, studioOutputs } from "@notebooklm/core/db/schema";
import {
  isCancellation,
  registerJob,
  unregisterJob,
} from "@notebooklm/core/jobs";
import {
  audioFileExtension,
  availableTtsProviders,
  concatAudio,
  resolveTtsCredential,
  resolveTtsProvider,
  type TtsAudioContentType,
  type TtsProvidersConfig,
  TtsProviderUnavailableError,
} from "@notebooklm/core/tts";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { PlatformAdapter } from "../../adapter";

const Body = z.object({
  notebookId: z.string().uuid(),
  length: z.enum(["short", "medium", "long"]),
  focus: z.string().optional(),
  /**
   * Which TTS backend to use. If omitted, the server picks whichever
   * provider is configured (Kokoro preferred when both are available
   * because it's local + free).
   */
  ttsProvider: z.enum(["deepgram", "kokoro"]).optional(),
});

type Segment = { speaker: "Alex" | "Sam"; text: string };

/**
 * Per-provider TTS concurrency defaults. Overridable via
 * STUDIO_TTS_CONCURRENCY (single int, applied to whichever provider was
 * picked) for advanced users.
 *
 * - `deepgram`: pure HTTP, can saturate easily — 8 in-flight is safe
 *   and substantially faster than 4 on long scripts.
 * - `kokoro` (HTTP backend, Kokoro-FastAPI): same — 8 by default if
 *   the server has GPU, but the FastAPI worker may be a single Python
 *   process so we keep 4 to avoid head-of-line blocking. Override via
 *   env if your server is sized differently.
 * - `kokoro` (in-process via kokoro-js): the ONNX session is single-
 *   threaded internally, so multiple concurrent `tts.generate` calls
 *   queue inside Python's GIL-equivalent. JS-side concurrency above 1
 *   only buys overlap on tokenization / decoding, which is negligible
 *   compared to inference. Default 2 — bumping this further is wasted
 *   memory pressure on the q8 weights. For real local parallelism you
 *   need worker threads with their own model copy (separate feature).
 */
function defaultConcurrencyFor(name: "deepgram" | "kokoro", isLocal: boolean) {
  if (name === "deepgram") return 8;
  if (name === "kokoro" && isLocal) return 2;
  return 4;
}

function resolveConcurrency(
  envValue: string | undefined,
  fallback: number,
): number {
  if (!envValue) return fallback;
  const n = Number.parseInt(envValue, 10);
  return Number.isFinite(n) && n >= 1 && n <= 32 ? n : fallback;
}

const TTS_RETRIES = 3;

async function buildTtsConfig(
  env: PlatformAdapter["env"],
  userId: string | undefined,
): Promise<TtsProvidersConfig> {
  const cfg: TtsProvidersConfig = {};

  // Per-user Deepgram credential wins over env. The wizard's audio
  // step writes here; env-var stays as the legacy fallback for
  // server-style deployments where there's a single shared key.
  const savedDeepgram = await resolveTtsCredential(userId, "deepgram");
  const deepgramKey = savedDeepgram.apiKey ?? env.DEEPGRAM_API_KEY;
  if (deepgramKey) {
    cfg.deepgram = { apiKey: deepgramKey };
  }

  // Kokoro is configured if either backend is reachable:
  //   - HTTP backend: KOKORO_BASE_URL is set (e.g. desktop running the
  //     bundled FastAPI container, or the web app pointing at one).
  //   - Local backend: KOKORO_DISABLE_LOCAL isn't "1" — we'll lazy-load
  //     `kokoro-js` at synthesis time. The web adapter sets disableLocal
  //     by default; desktop leaves it on.
  const wantLocal = env.KOKORO_DISABLE_LOCAL !== "1";
  if (env.KOKORO_BASE_URL || wantLocal) {
    cfg.kokoro = {
      baseUrl: env.KOKORO_BASE_URL,
      apiKey: env.KOKORO_API_KEY,
      model: env.KOKORO_MODEL,
      modelId: env.KOKORO_LOCAL_MODEL_ID,
      dtype: env.KOKORO_LOCAL_DTYPE,
      device: env.KOKORO_LOCAL_DEVICE,
      disableLocal: !wantLocal,
    };
  }
  return cfg;
}

/**
 * Audio overview = LLM-generated podcast script (via the harness) + TTS.
 * TTS is provider-agnostic — the handler resolves a {@link TtsProvider}
 * from `packages/core/src/tts` based on the request body and what the
 * adapter has configured. Today that's Deepgram (cloud) or Kokoro (local
 * Kokoro-FastAPI server). The split keeps the handler thin around the
 * LLM portion while the streaming / upload / DB-write orchestration stays
 * where it always was.
 */
export async function audioOverviewHandler(
  req: Request,
  adapter: PlatformAdapter,
): Promise<Response> {
  const session = await adapter.auth.api.getSession({ headers: req.headers });
  if (!session?.user) return new Response("Unauthorized", { status: 401 });

  const body = Body.parse(await req.json());

  const [nb] = await adapter.db
    .select()
    .from(notebooks)
    .where(
      and(
        eq(notebooks.id, body.notebookId),
        eq(notebooks.userId, session.user.id),
      ),
    )
    .limit(1);
  if (!nb) return new Response("Notebook not found", { status: 404 });

  // Resolve the TTS provider up front so the user gets a clean 4xx
  // before we burn LLM tokens on the script.
  const ttsConfig = await buildTtsConfig(adapter.env, session.user.id);
  let ttsProvider: ReturnType<typeof resolveTtsProvider>;
  try {
    ttsProvider = resolveTtsProvider(ttsConfig, body.ttsProvider);
  } catch (err) {
    if (err instanceof TtsProviderUnavailableError) {
      return new Response(
        JSON.stringify({
          error: err.message,
          provider: err.provider,
          available: availableTtsProviders(ttsConfig),
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }
    throw err;
  }

  const [row] = await adapter.db
    .insert(studioOutputs)
    .values({
      notebookId: body.notebookId,
      kind: "audio-overview",
      title: "Audio Overview",
      status: "generating",
    })
    .returning();

  // Register this job in the in-process registry so a future POST to
  // /api/studio/audio-overview/cancel can flip the cancelled flag and
  // we can bail out at the next safe checkpoint.
  const job = registerJob(row.id);

  // Resolve concurrency now that we know the provider + backend mode.
  const isLocalKokoro =
    ttsProvider.name === "kokoro" && !ttsConfig.kokoro?.baseUrl;
  const concurrency = resolveConcurrency(
    process.env.STUDIO_TTS_CONCURRENCY,
    defaultConcurrencyFor(ttsProvider.name, isLocalKokoro),
  );

  // Visible "I'm alive" log so the user can `tail` the dev server output
  // and watch generation progress without keeping the modal in front.
  const t0 = Date.now();
  const log = (msg: string, extra?: Record<string, unknown>) => {
    const ms = Date.now() - t0;
    // biome-ignore lint/suspicious/noConsole: dev-time progress signal
    console.log(
      `[audio-overview ${row.id.slice(0, 8)} +${ms}ms] ${msg}`,
      extra ?? "",
    );
  };

  /**
   * Mirror the in-flight progress to the studio_outputs row. The
   * AudioOverviewModal's "reattach" mode polls the row via tRPC and
   * reconstructs the progress UI from this snapshot — that's how
   * clicking the spinner pill in the Studio panel re-opens a live
   * progress view for a job already in flight.
   *
   * Errors here are best-effort — a transient DB write hiccup
   * shouldn't kill the generation. The next stage's update will
   * supersede the missed one.
   */
  const updateProgress = async (snapshot: {
    stage: string;
    message: string;
    ttsCompleted?: number;
    ttsTotal?: number;
    provider?: string;
    concurrency?: number;
  }) => {
    try {
      await adapter.db
        .update(studioOutputs)
        .set({
          progress: { ...snapshot, updatedAt: new Date().toISOString() },
        })
        .where(eq(studioOutputs.id, row.id));
    } catch (e) {
      log(`progress write failed (non-fatal): ${(e as Error).message}`);
    }
  };
  log(
    `request received — provider=${ttsProvider.name} length=${body.length} concurrency=${concurrency}${isLocalKokoro ? " (local kokoro-js)" : ""}`,
  );

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      // The client's fetch can be aborted (e.g. modal close). Track that
      // separately so we can keep the heavy work running while only
      // skipping the `controller.enqueue` calls that would otherwise
      // throw against the closed stream.
      let clientGone = false;
      req.signal?.addEventListener("abort", () => {
        clientGone = true;
        log("client disconnected — continuing work in the background");
      });

      function send(type: string, data: unknown) {
        if (clientGone) return;
        try {
          controller.enqueue(
            encoder.encode(`${JSON.stringify({ type, data })}\n`),
          );
        } catch {
          clientGone = true;
        }
      }

      // Emit the row id immediately so the client knows what to POST
      // to /api/studio/cancel if the user wants to bail mid-flight.
      send("started", {
        id: row.id,
        provider: ttsProvider.name,
        concurrency,
      });
      void updateProgress({
        stage: "starting",
        message: "Starting generation...",
        provider: ttsProvider.name,
        concurrency,
      });

      try {
        const readySources = await adapter.db
          .select({ content: sources.content })
          .from(sources)
          .where(
            and(
              eq(sources.notebookId, body.notebookId),
              eq(sources.status, "ready"),
            ),
          );

        let sourceContent = "";
        for (const s of readySources) {
          if (s.content) sourceContent += s.content + "\n\n";
          if (sourceContent.length >= 20000) break;
        }
        sourceContent = sourceContent.slice(0, 20000);

        if (!sourceContent.trim()) {
          throw new Error(
            "No source content available. Add sources to the notebook first.",
          );
        }
        log(`source content prepared — ${sourceContent.length} chars`);

        send("stage", {
          stage: "script",
          message: "Generating podcast script...",
        });
        void updateProgress({
          stage: "script",
          message: "Generating podcast script...",
        });
        log("loading agent runtimes for studio task");

        const runtimes = await loadRuntimesForTask(
          session.user.id,
          "studio",
        );

        let rawScript = "";
        let scriptDeltaCount = 0;
        try {
          // Intentionally NOT passing `req.signal` here. If the client
          // closes the modal mid-flight we'd rather let the LLM call
          // and the subsequent TTS work run to completion than throw
          // away the partial result — the studio_outputs row still
          // gets written to the DB, the panel can pick it up on the
          // next refresh, and the user doesn't lose 30 seconds of
          // work to a stray click.
          for await (const ev of runAgent(
            {
              kind: "studio",
              userId: session.user.id,
              notebookId: body.notebookId,
              outputKind: "audio-script",
              opts: {
                length: body.length,
                focus: body.focus,
                sourceContent,
              },
            },
            runtimes,
            { userId: session.user.id },
          )) {
            if (ev.type === "text-delta") {
              rawScript += ev.text;
              scriptDeltaCount++;
              send("script-delta", { text: ev.text });
              if (scriptDeltaCount % 25 === 0) {
                log(`script streaming — ${rawScript.length} chars so far`);
              }
            } else if (ev.type === "done" && typeof ev.finalText === "string") {
              // belt + braces — the runtime always emits the assembled
              // text on the final event.
              if (!rawScript) rawScript = ev.finalText;
            } else if (ev.type === "error") {
              throw new Error(ev.message);
            }
          }
          log(`script generation done — ${rawScript.length} chars total`);
        } catch (err) {
          if (err instanceof NoAiConfigError) {
            send("error", {
              message: `Configure a chat provider in Settings before generating studio outputs. (${err.role})`,
            });
            await adapter.db
              .update(studioOutputs)
              .set({ status: "error", content: { error: "NO_AI_CONFIG" } })
              .where(eq(studioOutputs.id, row.id));
            controller.close();
            return;
          }
          throw err;
        }

        const cleaned = rawScript
          .replace(/^```(?:json)?\s*\n?/i, "")
          .replace(/\n?```\s*$/i, "")
          .trim();

        let script: Segment[];
        try {
          script = JSON.parse(cleaned);
        } catch {
          throw new Error("Failed to parse podcast script as JSON");
        }

        send("script-done", { segments: script.length, script });
        log(`script parsed — ${script.length} segments`);

        if (job.cancelled) throw job.signal.reason;

        send("stage", {
          stage: "converting-tts",
          message: `Converting ${script.length} segments to audio with ${ttsProvider.name}...`,
        });
        void updateProgress({
          stage: "converting-tts",
          message: `Converting ${script.length} segments to audio with ${ttsProvider.name}...`,
          ttsCompleted: 0,
          ttsTotal: script.length,
          provider: ttsProvider.name,
          concurrency,
        });

        log(
          `TTS phase starting — ${script.length} segments, sliding-window concurrency=${concurrency}, retry=${TTS_RETRIES}`,
        );

        // Sliding-window concurrent map. Unlike chunked Promise.all,
        // this keeps `concurrency` calls in flight at all times — as
        // soon as one segment finishes, the next one starts. Long-tail
        // segments don't stall the rest of the pool.
        let segContentType: TtsAudioContentType | null = null;
        const speakWithRetry = (seg: Segment, idx: number) =>
          withRetry(
            async (attempt) => {
              if (attempt > 1) {
                log(`segment ${idx} retry attempt ${attempt}`);
                send("tts-retry", {
                  index: idx,
                  attempt,
                  total: script.length,
                });
              }
              if (job.cancelled) throw job.signal.reason;
              return ttsProvider.speak(seg);
            },
            {
              maxAttempts: TTS_RETRIES,
              signal: job.signal,
              shouldRetry: (err) => {
                // Don't retry cancellations or 4xx-shaped errors —
                // those won't get better. Retry network / 5xx / TTS
                // model glitches.
                if (isCancellation(err)) return false;
                const msg = err instanceof Error ? err.message : String(err);
                return !/\b(401|403|404|invalid|unauthorized|forbidden)\b/i.test(
                  msg,
                );
              },
              onRetry: (err, attempt, delay) => {
                const m = err instanceof Error ? err.message : String(err);
                log(
                  `segment ${idx} attempt ${attempt} failed (${m}) — retrying in ${delay}ms`,
                );
              },
            },
          );

        const audioBuffers = await pMap(
          script,
          async (seg, idx) => {
            const t = Date.now();
            const { audio, contentType } = await speakWithRetry(seg, idx);
            segContentType = contentType;
            log(
              `segment ${idx + 1}/${script.length} (${seg.speaker}) — ${Date.now() - t}ms, ${audio.length} bytes`,
            );
            return audio;
          },
          {
            concurrency,
            signal: job.signal,
            onProgress: (completed, total, lastIdx) => {
              const seg = script[lastIdx];
              if (!seg) return;
              send("tts", {
                index: lastIdx,
                completed,
                total,
                speaker: seg.speaker,
                text: seg.text.slice(0, 60),
              });
              // Persist so a re-attached modal sees the same counter.
              void updateProgress({
                stage: "converting-tts",
                message: `Converting to audio (${completed}/${total})...`,
                ttsCompleted: completed,
                ttsTotal: total,
                provider: ttsProvider.name,
                concurrency,
              });
            },
          },
        );

        send("stage", { stage: "combine", message: "Combining audio..." });
        void updateProgress({
          stage: "combine",
          message: "Combining audio...",
          ttsCompleted: script.length,
          ttsTotal: script.length,
        });
        // segContentType is set unless the script was empty, which we
        // already guarded against above. Default to mp3 just in case.
        const finalContentType: TtsAudioContentType =
          segContentType ?? "audio/mpeg";
        const { audio: combinedBuffer } = concatAudio(
          audioBuffers,
          finalContentType,
        );
        log(
          `combined audio: ${combinedBuffer.length} bytes (${finalContentType})`,
        );

        send("stage", { stage: "upload", message: "Uploading audio..." });
        void updateProgress({
          stage: "upload",
          message: "Uploading audio...",
        });
        const ext = audioFileExtension(finalContentType);
        const storageKey = `audio/${row.id}.${ext}`;
        const uploaded = await adapter.storage.upload({
          key: storageKey,
          body: combinedBuffer,
          contentType: finalContentType,
        });
        log(`uploaded to storage — key=${storageKey}`);

        await adapter.db
          .update(studioOutputs)
          .set({
            status: "ready",
            assetUrl: uploaded.url,
            progress: null, // job done — clear the live snapshot
            content: {
              script,
              length: body.length,
              focus: body.focus,
              ttsProvider: ttsProvider.name,
            },
          })
          .where(eq(studioOutputs.id, row.id));
        log(`DONE in ${Date.now() - t0}ms — assetUrl=${uploaded.url}`);

        send("done", { id: row.id, assetUrl: uploaded.url });
      } catch (err) {
        const cancelled = isCancellation(err) || job.cancelled;
        const message = err instanceof Error ? err.message : String(err);
        if (cancelled) {
          log(`CANCELLED after ${Date.now() - t0}ms`);
          await adapter.db
            .update(studioOutputs)
            .set({
              status: "cancelled",
              progress: null,
              content: { cancelled: true, cancelledAfterMs: Date.now() - t0 },
            })
            .where(eq(studioOutputs.id, row.id));
          send("cancelled", { id: row.id });
        } else {
          log(`FAILED — ${message}`);
          await adapter.db
            .update(studioOutputs)
            .set({
              status: "error",
              progress: null,
              content: { error: message },
            })
            .where(eq(studioOutputs.id, row.id));
          send("error", { message });
        }
      } finally {
        unregisterJob(row.id);
        try {
          controller.close();
        } catch {
          // already closed by the abort path — ignore
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
    },
  });
}
