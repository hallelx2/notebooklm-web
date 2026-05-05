"use client";

export function WelcomeStep({ onContinue }: { onContinue: () => void }) {
  return (
    <div className="space-y-6 sm:space-y-8">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-widest text-slate-500 dark:text-zinc-400 mb-3">
          Welcome
        </p>
        <h1 className="text-3xl sm:text-4xl md:text-5xl font-medium tracking-tighter mb-3">
          Local-first AI for your notes
        </h1>
        <p className="text-slate-600 dark:text-zinc-400 text-base leading-relaxed max-w-xl">
          NotebookLM Desktop runs against your own files, your own keys,
          and your own machine. Nothing leaves the device unless you
          point it somewhere else.
        </p>
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
        <button
          type="button"
          onClick={onContinue}
          className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-black font-medium text-sm hover:bg-slate-800 dark:hover:bg-zinc-200 transition-colors"
        >
          Let's set things up
          <span className="material-symbols-outlined text-base">
            arrow_forward
          </span>
        </button>
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
    <div className="rounded-xl border border-slate-200 dark:border-white/10 p-4 bg-slate-50/40 dark:bg-white/[0.02]">
      <div className="flex items-center gap-2 mb-1.5">
        <span className="material-symbols-outlined text-[18px] text-indigo-500 dark:text-indigo-400">
          {icon}
        </span>
        <h3 className="text-sm font-medium text-slate-900 dark:text-white">
          {title}
        </h3>
      </div>
      <p className="text-xs text-slate-600 dark:text-zinc-400 leading-relaxed">
        {body}
      </p>
    </div>
  );
}
