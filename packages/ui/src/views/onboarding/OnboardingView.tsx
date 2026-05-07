"use client";

/**
 * First-launch onboarding wizard.
 */

import type { ReactNode } from "react";
import { useCallback, useEffect, useState } from "react";
import { useAuth, useRouter } from "../../contexts";
import { trpc } from "../../trpc/client";
import { AudioStep } from "./AudioStep";
import { ChatProviderStep } from "./ChatProviderStep";
import { DoneStep } from "./DoneStep";
import { EmbeddingStep } from "./EmbeddingStep";
import { WebSearchStep } from "./WebSearchStep";
import { WelcomeStep } from "./WelcomeStep";

type StepId =
  | "welcome"
  | "chat"
  | "embedding"
  | "audio"
  | "search"
  | "done";

const STEPS: { id: StepId; label: string }[] = [
  { id: "welcome", label: "Welcome" },
  { id: "chat", label: "AI provider" },
  { id: "embedding", label: "Embeddings" },
  { id: "audio", label: "Audio" },
  { id: "search", label: "Web search" },
  { id: "done", label: "Done" },
];

export function OnboardingView() {
  const router = useRouter();
  const auth = useAuth();
  const aiConfigQ = trpc.aiConfig.get.useQuery(undefined, {
    enabled: auth.status === "authenticated",
  });

  const [stepIdx, setStepIdx] = useState(0);

  useEffect(() => {
    if (aiConfigQ.data?.isOnboarded) {
      router.replace("/notebooks");
    }
  }, [aiConfigQ.data?.isOnboarded, router]);

  useEffect(() => {
    if (auth.status === "unauthenticated") {
      router.replace("/auth/sign-in?next=/onboarding");
    }
  }, [auth.status, router]);

  const next = useCallback(() => {
    setStepIdx((i) => Math.min(i + 1, STEPS.length - 1));
  }, []);
  const back = useCallback(() => {
    setStepIdx((i) => Math.max(i - 1, 0));
  }, []);
  const goto = useCallback((id: StepId) => {
    const i = STEPS.findIndex((s) => s.id === id);
    if (i >= 0) setStepIdx(i);
  }, []);

  const currentStep = STEPS[stepIdx]?.id ?? "welcome";

  return (
    <div className="min-h-screen flex flex-col bg-canvas text-fg">
      <Header stepIdx={stepIdx} totalSteps={STEPS.length} />

      <main className="flex-1 flex items-start justify-center px-4 py-10 sm:py-14">
        <div className="w-full max-w-2xl">
          <StepBody
            step={currentStep}
            onNext={next}
            onSkip={next}
            onJumpTo={goto}
          />
        </div>
      </main>

      <FooterNav
        stepIdx={stepIdx}
        totalSteps={STEPS.length}
        onBack={back}
        currentStep={currentStep}
      />
    </div>
  );
}

function Header({
  stepIdx,
  totalSteps,
}: {
  stepIdx: number;
  totalSteps: number;
}) {
  return (
    <header className="border-b border-border-subtle px-4 sm:px-8 py-4 flex items-center justify-between">
      <div className="flex items-center gap-2.5">
        <span className="w-7 h-7 rounded-card bg-accent flex items-center justify-center">
          <span className="material-symbols-outlined text-fg-on-accent text-sm icon-filled">
            book_2
          </span>
        </span>
        <span className="font-medium tracking-tight text-sm">NotebookLM</span>
        <span className="hidden sm:inline-block h-4 w-px bg-border-subtle mx-1" />
        <span className="hidden sm:inline text-[10px] font-bold uppercase tracking-widest text-fg-muted">
          Setup
        </span>
      </div>
      <div className="flex items-center gap-2 text-[11px] text-fg-muted">
        <span>
          Step {Math.min(stepIdx + 1, totalSteps)} of {totalSteps}
        </span>
        <div className="w-32 h-1 rounded-full bg-border-subtle overflow-hidden">
          <div
            className="h-full bg-accent transition-all duration-500"
            style={{
              width: `${((stepIdx + 1) / totalSteps) * 100}%`,
            }}
          />
        </div>
      </div>
    </header>
  );
}

function FooterNav({
  stepIdx,
  totalSteps,
  onBack,
  currentStep,
}: {
  stepIdx: number;
  totalSteps: number;
  onBack: () => void;
  currentStep: StepId;
}) {
  const onLast = stepIdx === totalSteps - 1;
  if (onLast) return null;
  return (
    <footer className="border-t border-border-subtle px-4 sm:px-8 py-4 flex items-center justify-between">
      <button
        type="button"
        onClick={onBack}
        disabled={stepIdx === 0}
        className="text-[11px] font-bold uppercase tracking-widest text-fg-muted hover:text-fg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
      >
        ← Back
      </button>
      <span className="text-[11px] text-fg-muted">
        {currentStep === "welcome"
          ? "This takes about 90 seconds"
          : "Use Settings to change anything later"}
      </span>
    </footer>
  );
}

function StepBody({
  step,
  onNext,
  onSkip,
  onJumpTo,
}: {
  step: StepId;
  onNext: () => void;
  onSkip: () => void;
  onJumpTo: (id: StepId) => void;
}): ReactNode {
  switch (step) {
    case "welcome":
      return <WelcomeStep onContinue={onNext} />;
    case "chat":
      return <ChatProviderStep onContinue={onNext} />;
    case "embedding":
      return <EmbeddingStep onContinue={onNext} />;
    case "audio":
      return <AudioStep onContinue={onNext} onSkip={onSkip} />;
    case "search":
      return <WebSearchStep onContinue={onNext} onSkip={onSkip} />;
    case "done":
      return <DoneStep onJumpTo={onJumpTo} />;
  }
}
