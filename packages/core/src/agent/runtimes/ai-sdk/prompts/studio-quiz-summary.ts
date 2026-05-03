/**
 * Prompt for the `quiz-summary` studio kind — the encouraging study
 * coach review the user sees after submitting a quiz. Verbatim port
 * from `packages/server/src/handlers/studio/quiz-summary.ts`.
 */

export type QuizGradedResult = {
  question: string;
  correctAnswer: string;
  userAnswer: string;
  isCorrect: boolean;
};

export function quizSummaryPrompt(opts: {
  results: QuizGradedResult[];
  correct: number;
  total: number;
}): string {
  const { results, correct, total } = opts;
  return `You are a study coach reviewing a student's quiz results. They scored ${correct}/${total}.

Here are the results:
${results.map((r, i) => `${i + 1}. ${r.question}\n   Correct: ${r.correctAnswer}\n   Student answered: ${r.userAnswer} — ${r.isCorrect ? "✓ Correct" : "✗ Wrong"}`).join("\n\n")}

Write a brief, encouraging personalized study summary (3-5 paragraphs):
1. Overall performance assessment
2. Key strengths (topics they got right)
3. Areas to improve (topics they got wrong, with brief explanations of the correct answers)
4. Specific study recommendations

Be encouraging but honest. Use markdown formatting.`;
}
