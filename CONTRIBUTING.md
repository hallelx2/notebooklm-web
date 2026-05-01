# Contributing to notebooklm-web

Thanks for considering a contribution. This project is small enough that one person ships things fast and big enough that there is real surface area for help. Below is everything you need to know to land a useful PR.

---

## TL;DR

- Read [`ROADMAP.md`](ROADMAP.md) for what we are building
- Read [`docs/AGENT-HARNESS.md`](docs/AGENT-HARNESS.md) for the technical vision
- Pick a contribution from the list below or open an issue with your idea
- Follow the local setup
- Open a PR with a clear description and a screenshot or test where it makes sense

---

## What we are looking for

Ordered by impact on the project, highest first.

### 🟦 The headline contributions

These are the contributions that move the project forward fastest. If you take one of these on, you are shaping the direction of the project, not just polishing an edge.

1. **The desktop app (Phase 2 of the roadmap).** Tauri or Electron shell that wraps the existing core and runs fully offline. File-system access to user folders, automatic ingest of dropped folders, local Ollama + Piper integration, embedded database (PGlite or SQLite + sqlite-vec). This is the single most-wanted contribution.

2. **The pnpm workspace migration (Phase 1).** Turn this repo into a monorepo with `apps/web`, `apps/desktop`, and `packages/core`. The shared libraries (`lib/ai`, `lib/retrieve`, `lib/ingest`, `db/schema`, `lib/crypto`, all prompts) move into `packages/core`.

3. **The agent harness (Phase 3).** Pluggable runtime backends — AI SDK, Claude Agent SDK, OpenAI Agents SDK, Copilot Agent SDK, local agents via Ollama tool calling. Per-task runtime selection, fallback chains, BYO-API. See [`docs/AGENT-HARNESS.md`](docs/AGENT-HARNESS.md) for the full vision.

For any of these three, **open an issue first** describing your approach so we can talk shape before you spend time. These are large enough that two people accidentally building the same thing in parallel would be a real loss.

### 🟢 High-leverage contributions

Smaller scope, still meaningful.

- **Local model integrations.** Better Ollama UX (auto-detect installed models, one-click pull). Native llama.cpp bindings for sub-second embedding. GGUF embedding adapters.
- **Local TTS adapters.** Piper, Kokoro-82M, Coqui XTTS — same interface as the Deepgram adapter, drop-in for audio overviews.
- **More AI providers.** The registry is one file: `src/lib/ai/providers.ts`. Add the provider, add the models, add the dispatch case in `src/lib/ai/factory.ts`. PR usually under 100 lines.
- **More studio output kinds.** Add the kind label, write the prompt in `src/server/routers/studio.ts`, ship a renderer component.
- **More embedding-dim sibling tables.** 768/1024/1536/3072 cover most providers today. 4096 and beyond are interesting if a provider you want to add ships at that dim.
- **More web-search providers.** Exa and Tavily are the current options. Brave, You.com, SerpAPI, Bing Search would all slot in cleanly.
- **Citation enhancements.** The "verify this claim" feature — a button that asks the model to extract the exact phrase from the cited chunk that supports the claim.
- **Multi-language support.** Audio overviews in Spanish, French, etc. Prompts that work across languages.

### 🟡 Solid contributions

The bread-and-butter PRs that keep the project healthy.

- **Bug fixes** — found something broken? Open an issue or send a PR.
- **Documentation** — README clarifications, code comments, architecture diagrams, tutorial-style guides for specific use cases.
- **Tests** — there are not enough yet. Adding tests for the retrieval pipeline, the chunker, or the deep-research orchestration is genuinely useful.
- **Accessibility** — keyboard navigation, screen-reader labels, focus management in modals.
- **Performance** — benchmark the retrieval pipeline at 100k chunks, profile the deep-research path, find the bottlenecks.
- **Internationalisation** — i18n the UI strings for non-English users.

---

## Local development setup

### Prerequisites

- **Bun** ≥ 1.1 ([install](https://bun.sh))
- **Postgres** with the `pgvector` extension. The easiest paths:
  - [Neon](https://neon.tech) — serverless, free tier, branching
  - [Supabase](https://supabase.com) — pgvector preinstalled
  - Local Postgres + `CREATE EXTENSION pgvector;`
- **An API key from at least one AI provider** — recommended starting points: Google Gemini (free tier on Flash), OpenAI, Anthropic, or Ollama if you want to go fully local

### Steps

```bash
git clone https://github.com/hallelx2/notebooklm-web.git
cd notebooklm-web
bun install
cp .env.example .env       # fill in DATABASE_URL, AUTH_SECRET, MASTER_KEY_V1
bun run db:push            # push the Drizzle schema + create pgvector extension
bun run db:hnsw            # create HNSW indexes on the embedding sibling tables
bun run dev                # http://localhost:3000
```

Sign up, walk through onboarding, drop in your AI provider key, pick a chat model and an embedding model, and you are ready to add notebooks.

### Generating the AES-GCM master key

Encrypted credentials need a 32-byte key in `MASTER_KEY_V1`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
# or
openssl rand -base64 32
```

Add the result to `.env` as `MASTER_KEY_V1=...`. Rotate by adding `MASTER_KEY_V2`, then re-saving each user's credentials (the system will encrypt under V2 going forward and continue reading V1 until rotated out).

---

## The PR process

### Before you open a PR

1. **For headline contributions** (desktop app, workspace migration, agent harness): open an issue first. Give us a sketch of your approach. We will respond with shape feedback before you write code.
2. **For smaller contributions**: just open the PR. If the change is non-trivial, an issue is helpful but not required.
3. **Run the checks locally**:
   ```bash
   bun run lint        # Biome lint
   bun run format      # Biome format
   bun run typecheck   # tsc --noEmit
   bun run build       # Production build
   ```
4. **If you touched the schema**, regenerate types and verify migrations apply cleanly against a fresh DB.

### Writing the PR description

Include:

- **What changed and why** (one paragraph)
- **How to test** (steps to reproduce the new behaviour)
- **Screenshots or short clips** for UI changes
- **Trade-offs** if you made design choices that someone else might have made differently
- **Open questions** if you want feedback on a specific decision

A good PR description tells the reviewer what to look for. A great one tells them what *not* to look for, because you have already verified those things yourself.

### Code style

- **Biome** handles lint and format. Run `bun run format` before committing.
- **Drizzle** is the schema source of truth. Schema changes go through `db:push` and HNSW indexes through `db:hnsw`.
- **Zod schemas** for every structured-output LLM call. The schema is the prompt.
- **AI SDK** is the universal model interface. Add new providers via `lib/ai/providers.ts` + `lib/ai/factory.ts`, not via direct SDK imports in route handlers.
- **No secrets in code or in committed env files.** `.env.example` has placeholders only.

### Commit messages

Conventional-ish but not strictly enforced. Roughly:

- `feat(scope): ...` for new functionality
- `fix(scope): ...` for bugs
- `refactor(scope): ...` for non-behaviour changes
- `docs: ...` for docs-only
- `chore: ...` for tooling

If you are not sure, write a clear sentence and we will rewrite it for you on merge if needed.

---

## How to contribute to specific layers

### Adding a new AI provider

1. Add the entry to `PROVIDERS` in `src/lib/ai/providers.ts`
2. Add the dispatch case in `buildChatModel` (and `buildEmbedHandle` if it embeds) in `src/lib/ai/factory.ts`
3. Drop the provider's logo SVG in `public/providers/`
4. Test the connection via the settings page
5. Open the PR

Most provider PRs are under 100 lines.

### Adding a new studio output kind

1. Add the kind label to `KIND_TITLES` in `src/server/routers/studio.ts`
2. Write the prompt in `buildPrompt` for that kind
3. If the output is structured (JSON), add the kind to `STRUCTURED_KINDS`
4. Write the renderer component in `src/module/notebook/components/`
5. Add the renderer to `StudioOutputModal`'s switch
6. Open the PR

### Adding a new embedding-dim sibling table

1. Add the table definition in `src/db/schema.ts` following the pattern of `chunkEmbeddings768`
2. Add the dim to `SUPPORTED_EMBED_DIMS` in `src/lib/ai/providers.ts`
3. Add the HNSW index migration in `src/db/migrate-hnsw.ts`
4. Update the dispatch in `lib/retrieve.ts` to handle the new dim
5. Open the PR

---

## Code of conduct

Be respectful. Disagree on technical merits, never on identity. Make the project a place people want to come back to. If something feels off, raise it directly with [@hallelx2](https://github.com/hallelx2) or via email at halleluyaholudele@gmail.com.

---

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).

---

## A note on tone

This project is documented like an open notebook because that is what it is. Issues, PRs, and discussions can be informal. Long PR descriptions with diagrams and prose are welcome. So are one-line bug fixes with a clear commit message. Match the shape of your contribution to the size of the change.

If you are unsure whether a contribution is wanted, **open an issue and ask**. The cost of asking is low; the cost of building the wrong thing for two weeks is high.

Thanks for being here.
