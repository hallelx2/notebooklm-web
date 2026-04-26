import { streamText } from "ai";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { notebooks, sources, studioOutputs } from "@/db/schema";
import { getChatModel, NoAiConfigError } from "@/lib/ai/factory";
import { auth } from "@/lib/auth";

export const runtime = "nodejs";
export const maxDuration = 300;

const Body = z.object({
  notebookId: z.string().uuid(),
  length: z.enum(["short", "medium", "long"]),
  focus: z.string().optional(),
});

const LENGTH_GUIDE: Record<string, string> = {
  short: "short conversation = 4-6 exchanges total",
  medium: "medium conversation = 8-12 exchanges total",
  long: "long deep-dive conversation = 15-20 exchanges total",
};

const VOICE_MAP: Record<string, string> = {
  Alex: "aura-orion-en",
  Sam: "aura-asteria-en",
};

type Segment = { speaker: "Alex" | "Sam"; text: string };

/** Convert a single segment to MP3 via Deepgram TTS */
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

export async function POST(req: Request) {
  /* ── 1. Auth ──────────────────────────────────────────────────────── */
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user) return new Response("Unauthorized", { status: 401 });

  const body = Body.parse(await req.json());

  /* ── 2. Verify ownership ──────────────────────────────────────────── */
  const [nb] = await db
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

  /* ── 3. Pre-flight checks ────────────────────────────────────────── */
  const deepgramKey = process.env.DEEPGRAM_API_KEY;
  if (!deepgramKey) {
    return new Response(
      JSON.stringify({ error: "DEEPGRAM_API_KEY is not configured" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  let chatModel: Awaited<ReturnType<typeof getChatModel>>;
  try {
    chatModel = await getChatModel(session.user.id);
  } catch (err) {
    if (err instanceof NoAiConfigError) {
      return Response.json(
        { error: "NO_AI_CONFIG", role: err.role },
        { status: 412 },
      );
    }
    throw err;
  }

  /* ── 4. Create studio output row ─────────────────────────────────── */
  const [row] = await db
    .insert(studioOutputs)
    .values({
      notebookId: body.notebookId,
      kind: "audio-overview",
      title: "Audio Overview",
      status: "generating",
    })
    .returning();

  /* ── 5. Stream NDJSON progress ────────────────────────────────────── */
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      function send(type: string, data: unknown) {
        controller.enqueue(
          encoder.encode(`${JSON.stringify({ type, data })}\n`),
        );
      }

      try {
        /* ── Gather source content ──────────────────────────────── */
        const readySources = await db
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

        /* ── Step 1: Generate podcast script (streamed) ────────── */
        send("stage", {
          stage: "script",
          message: "Generating podcast script...",
        });

        const lengthGuide = LENGTH_GUIDE[body.length];
        const result = streamText({
          model: chatModel,
          prompt: `Generate a podcast-style conversation between two hosts discussing the source material.

Host A ("Alex") is the main explainer who presents key ideas clearly.
Host B ("Sam") asks insightful questions, adds reactions, and provides alternative perspectives.

Length guideline: ${lengthGuide}
${body.focus ? `Focus area: ${body.focus}` : "Cover the main topics comprehensively."}

Return ONLY valid JSON array: [{ "speaker": "Alex" | "Sam", "text": "..." }, ...]

Make it natural, conversational, engaging. Include:
- An introduction where Alex introduces the topic
- Back-and-forth discussion with Sam asking good questions
- Sam occasionally saying "That's fascinating" or "Wait, so you're saying..."
- A brief conclusion/summary

Source material:
${sourceContent}`,
        });

        // Stream the script text to the client as it's generated
        let rawScript = "";
        for await (const chunk of result.textStream) {
          rawScript += chunk;
          send("script-delta", { text: chunk });
        }

        // Parse the completed script
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

        send("script-done", {
          segments: script.length,
          script,
        });

        /* ── Step 2: Generate audio (parallel batches) ──────────── */
        send("stage", {
          stage: "converting-tts",
          message: `Converting ${script.length} segments to audio...`,
        });

        const PARALLEL = 4; // process 4 segments at a time
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

        /* ── Step 3: Combine audio ──────────────────────────────── */
        send("stage", {
          stage: "combine",
          message: "Combining audio...",
        });
        const combinedBuffer = Buffer.concat(audioBuffers);

        /* ── Step 4: Upload to Supabase storage ─────────────────── */
        send("stage", {
          stage: "upload",
          message: "Uploading audio...",
        });

        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
        const bucket = process.env.SUPABASE_BUCKET ?? "sources";
        const storageKey = `audio/${row.id}.mp3`;

        if (!supabaseUrl || !supabaseKey) {
          throw new Error(
            "Supabase storage is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_KEY.",
          );
        }

        const uploadRes = await fetch(
          `${supabaseUrl}/storage/v1/object/${bucket}/${encodeURIComponent(storageKey)}`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${supabaseKey}`,
              apikey: supabaseKey,
              "Content-Type": "audio/mpeg",
              "x-upsert": "true",
            },
            body: combinedBuffer,
          },
        );

        if (!uploadRes.ok) {
          const errText = await uploadRes.text().catch(() => "");
          throw new Error(
            `Supabase upload failed: ${uploadRes.status} ${errText}`,
          );
        }

        const publicUrl = `${supabaseUrl}/storage/v1/object/public/${bucket}/${encodeURIComponent(storageKey)}`;

        /* ── Step 5: Finalize ───────────────────────────────────── */
        await db
          .update(studioOutputs)
          .set({
            status: "ready",
            assetUrl: publicUrl,
            content: { script, length: body.length, focus: body.focus },
          })
          .where(eq(studioOutputs.id, row.id));

        send("done", { id: row.id, assetUrl: publicUrl });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await db
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
