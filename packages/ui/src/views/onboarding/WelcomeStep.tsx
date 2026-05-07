"use client";

import { Button, Card, Heading, Text } from "@notebooklm/ui";

export function WelcomeStep({ onContinue }: { onContinue: () => void }) {
  return (
    <div className="space-y-6 sm:space-y-8">
      <div>
        <Text variant="caption" tone="muted" className="mb-3">
          Welcome
        </Text>
        <Heading
          level="h2"
          weight="medium"
          className="text-3xl sm:text-4xl md:text-5xl tracking-tighter mb-3"
        >
          Local-first AI for your notes
        </Heading>
        <Text
          variant="body"
          tone="secondary"
          className="text-base leading-relaxed max-w-xl"
        >
          NotebookLM Desktop runs against your own files, your own keys, and
          your own machine. Nothing leaves the device unless you point it
          somewhere else.
        </Text>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <FeatureCard
          icon="hub"
          title="AI provider"
          body="Pick a chat model — cloud (Google, OpenAI, Anthropic, Groq…) or fully local with Ollama."
        />
        <FeatureCard
          icon="search"
          title="Embeddings"
          body="Bundled BGE-Small handles retrieval offline. Swap to Ollama or a cloud provider any time."
        />
        <FeatureCard
          icon="headphones"
          title="Audio overviews"
          body="Optional. Two-voice podcast summary of your sources via the bundled Kokoro model."
        />
        <FeatureCard
          icon="travel_explore"
          title="Web search"
          body="Optional. Tavily free tier is the default; add Exa as a paid fallback if you want both."
        />
      </div>

      <div className="pt-2">
        <Button
          variant="primary"
          size="lg"
          onClick={onContinue}
          className="w-full sm:w-auto"
        >
          Let's set things up
          <span className="material-symbols-outlined text-base">
            arrow_forward
          </span>
        </Button>
      </div>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  body,
}: {
  icon: string;
  title: string;
  body: string;
}) {
  return (
    <Card variant="default" padding="sm" className="bg-accent-soft">
      <div className="flex items-center gap-2 mb-1.5">
        <span className="material-symbols-outlined text-[18px] text-fg-accent">
          {icon}
        </span>
        <h3 className="text-sm font-medium text-fg">{title}</h3>
      </div>
      <p className="text-xs text-fg-secondary leading-relaxed">{body}</p>
    </Card>
  );
}
