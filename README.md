# notebooklm-web

TypeScript / Next.js rewrite of the NotebookLM clone. Stack mirrors `voxtar-web`:

- Next.js 16 (App Router) + React 19
- Bun runtime / package manager
- Drizzle ORM + Neon (serverless Postgres)
- tRPC v11 + TanStack Query
- Better Auth
- Tailwind CSS v4
- Biome (lint + format)

## Getting started

```bash
bun install
bun run db:push
bun run dev
```

Copy `.env.example` to `.env` and fill it in (the seed `.env` carried over from the Python app is already here for local dev).

## Layout

```
src/
  app/         # Next routes (landing, /notebooks, /api/trpc, /api/auth)
  components/  # ui / shared / layout
  db/          # Drizzle schema + connection
  lib/         # auth, utils
  module/      # Feature modules grouped by domain (landing, notebooks)
  server/      # tRPC root + routers
  trpc/        # client + provider
```
