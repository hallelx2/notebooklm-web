import { runAgent } from "@notebooklm/core/agent";
import { NoAiConfigError } from "@notebooklm/core/ai/factory";
import { notebooks, sources, studioOutputs } from "@notebooklm/core/db/schema";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { PlatformAdapter } from "../../adapter";

const Body = z.object({
  notebookId: z.string().uuid(),
  length: z.enum(["short", "medium", "long"]),
  focus: z.string().optional(),
});

const VOICE_MAP: Record<string, string> = {
  Alex: "aura-orion-en",
  Sam: "aura-asteria-en",
};

type Segment = { speaker: "Alex" | "Sam"; text: string };

async function ttsSegment(segment: Segment, apiKey: string): Promise<Buffer> {
  const voice = VOICE_MAP[segment.speaker] ?? "aura-asteria-en";
  const res = await fetch(
    `https://api.deepgram.com/v1/speak?model=${voice}&encoding=mp3`,
    {
      method: "POST",
      headers: {
        Authorization: `Token ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text: segment.text }),
    },
  );
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Deepgram TTS ${res.status}: ${body || res.statusText}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

/**
 * Audio overview = LLM-generated podcast script (via the harness) + TTS
 * (Deepgram, stays in this handler — it's not an agent task). The split
 * keeps the handler thin around the LLM portion while the streaming /
 * upload / DB-write orchestration stays where it always was.
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

  const deepgramKey = adapter.env.DEEPGRAM_API_KEY;
  if (!deepgramKey) {
    return new Response(
      JSON.stringify({ error: "DEEPGRAM_API_KEY is not configured" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
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

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      function send(type: string, data: unknown) {
        controller.enqueue(
          encoder.encode(`${JSON.stringify({ type, data })}\n`),
        );
      }

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

        send("stage", {
          stage: "script",
          message: "Generating podcast script...",
        });

        let rawScript = "";
        try {
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
            [{ id: "ai-sdk" }],
            { userId: session.user.id, signal: req.signal },
          )) {
            if (ev.type === "text-delta") {
              rawScript += ev.text;
              send("script-delta", { text: ev.text });
            } else if (ev.type === "done" && typeof ev.finalText === "string") {
              // belt + braces — the runtime always emits the assembled
              // text on the final event.
              if (!rawScript) rawScript = ev.finalText;
            } else if (ev.type === "error") {
              throw new Error(ev.message);
            }
          }
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

        send("stage", {
          stage: "converting-tts",
          message: `Converting ${script.length} segments to audio...`,
        });

        const PARALLEL = 4;
        const audioBuffers: Buffer[] = new Array(script.length);
        for (let i = 0; i < script.length; i += PARALLEL) {
          const batch = script.slice(i, i + PARALLEL);
          const promises = batch.map((seg, j) => {
            const idx = i + j;
            return ttsSegment(seg, deepgramKey).then((buf) => {
              audioBuffers[idx] = buf;
              send("tts", {
                index: idx,
                total: script.length,
                speaker: seg.speaker,
                text: seg.text.slice(0, 60),
              });
            });
          });
          await Promise.all(promises);
        }

        send("stage", { stage: "combine", message: "Combining audio..." });
        const combinedBuffer = Buffer.concat(audioBuffers);

        send("stage", { stage: "upload", message: "Uploading audio..." });
        const storageKey = `audio/${row.id}.mp3`;
        const uploaded = await adapter.storage.upload({
          key: storageKey,
          body: combinedBuffer,
          contentType: "audio/mpeg",
        });

        await adapter.db
          .update(studioOutputs)
          .set({
            status: "ready",
            assetUrl: uploaded.url,
            content: { script, length: body.length, focus: body.focus },
          })
          .where(eq(studioOutputs.id, row.id));

        send("done", { id: row.id, assetUrl: uploaded.url });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await adapter.db
          .update(studioOutputs)
          .set({ status: "error", content: { error: message } })
          .where(eq(studioOutputs.id, row.id));
        send("error", { message });
      } finally {
        controller.close();
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
