import { runAgent } from "@notebooklm/core/agent";
import { NoAiConfigError } from "@notebooklm/core/ai/factory";
import type { PlatformAdapter } from "../../adapter";

interface QuizQuestion {
  question: string;
  options: string[];
  answer: number;
}

/**
 * Routes through the agent harness with `kind: "studio", outputKind:
 * "quiz-summary"`. The adapter grades the answers locally and asks the
 * user's chat model for the supportive write-up — same prompt and
 * output as the pre-harness handler. The handler shrinks to:
 *   1. auth + body parse
 *   2. dispatch the task
 *   3. read `done.finalText` and return as JSON
 */
export async function quizSummaryHandler(
  req: Request,
  adapter: PlatformAdapter,
): Promise<Response> {
  const session = await adapter.auth.api.getSession({ headers: req.headers });
  if (!session?.user) return new Response("Unauthorized", { status: 401 });

  const body = (await req.json()) as {
    questions: QuizQuestion[];
    answers: number[];
  };
  const { questions, answers } = body;

  let summary = "";
  try {
    for await (const ev of runAgent(
      {
        kind: "studio",
        userId: session.user.id,
        outputKind: "quiz-summary",
        opts: { questions, answers },
      },
      [{ id: "ai-sdk" }],
      { userId: session.user.id, signal: req.signal },
    )) {
      if (ev.type === "done" && typeof ev.finalText === "string") {
        summary = ev.finalText;
      }
    }
  } catch (err) {
    if (err instanceof NoAiConfigError) {
      return Response.json(
        { error: "NO_AI_CONFIG", role: err.role },
        { status: 412 },
      );
    }
    throw err;
  }

  return Response.json({ summary });
}
