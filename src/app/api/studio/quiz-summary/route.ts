import { google } from "@ai-sdk/google";
import { generateText } from "ai";
import { auth } from "@/lib/auth";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: Request) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user) return new Response("Unauthorized", { status: 401 });

  const { questions, answers } = await req.json();

  // Build a summary of what was right/wrong
  const results = questions.map((q: any, i: number) => {
    const selected = answers[i];
    const isCorrect = selected === q.answer;
    return {
      question: q.question,
      correctAnswer: q.options[q.answer],
      userAnswer: selected !== undefined ? q.options[selected] : "Not answered",
      isCorrect,
    };
  });

  const correct = results.filter((r: any) => r.isCorrect).length;
  const total = results.length;

  const { text } = await generateText({
    model: google("gemini-2.5-flash"),
    prompt: `You are a study coach reviewing a student's quiz results. They scored ${correct}/${total}.

Here are the results:
${results.map((r: any, i: number) => `${i + 1}. ${r.question}\n   Correct: ${r.correctAnswer}\n   Student answered: ${r.userAnswer} — ${r.isCorrect ? "✓ Correct" : "✗ Wrong"}`).join("\n\n")}

Write a brief, encouraging personalized study summary (3-5 paragraphs):
1. Overall performance assessment
2. Key strengths (topics they got right)
3. Areas to improve (topics they got wrong, with brief explanations of the correct answers)
4. Specific study recommendations

Be encouraging but honest. Use markdown formatting.`,
  });

  return Response.json({ summary: text });
}
