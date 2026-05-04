/**
 * Zod schemas for every tRPC procedure return type.
 *
 * These exist so the `AppRouter` type — which packages/ui's React components
 * consume via `trpc.X.useQuery()` — is derived from explicit, hand-written
 * Zod shapes rather than from Drizzle's `.select()` inference. Two wins:
 *
 * 1. Bundle size: the desktop's React bundle doesn't pull in
 *    drizzle-orm/pg-core column types just to render a notebook list.
 * 2. API hygiene: every breaking change to a procedure return value shows
 *    up here, not as a silent inference shift downstream.
 *
 * Each schema mirrors the shape `.$inferSelect` would produce, but written
 * manually. Drift between the schema and the table is caught by the
 * `Output extends Input` check inside each procedure's `.output()` call.
 */
import { z } from "zod";

const dateLike = z.union([z.date(), z.string().datetime()]);

export const NotebookSchema = z.object({
  id: z.string().uuid(),
  userId: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  createdAt: dateLike,
  updatedAt: dateLike,
});
export type Notebook = z.infer<typeof NotebookSchema>;

export const SourceSchema = z.object({
  id: z.string().uuid(),
  notebookId: z.string().uuid(),
  kind: z.string(),
  title: z.string(),
  uri: z.string().nullable(),
  content: z.string().nullable(),
  status: z.string(),
  storageProvider: z.string().nullable(),
  storageKey: z.string().nullable(),
  mimeType: z.string().nullable(),
  size: z.number().nullable(),
  error: z.string().nullable(),
  metadata: z.unknown().nullable(),
  createdAt: dateLike,
  updatedAt: dateLike,
});
export type Source = z.infer<typeof SourceSchema>;

export const MessageSchema = z.object({
  id: z.string().uuid(),
  notebookId: z.string().uuid(),
  role: z.string(),
  content: z.string(),
  citations: z.unknown().nullable(),
  createdAt: dateLike,
});
export type Message = z.infer<typeof MessageSchema>;

export const StudioOutputSchema = z.object({
  id: z.string().uuid(),
  notebookId: z.string().uuid(),
  kind: z.string(),
  title: z.string(),
  content: z.unknown().nullable(),
  assetUrl: z.string().nullable(),
  status: z.string(),
  progress: z.unknown().nullable(),
  createdAt: dateLike,
});
export type StudioOutput = z.infer<typeof StudioOutputSchema>;

export const DeepResearchRunSchema = z.object({
  id: z.string().uuid(),
  notebookId: z.string().uuid(),
  query: z.string(),
  mode: z.string(),
  plan: z.unknown().nullable(),
  sources: z.unknown().nullable(),
  report: z.string().nullable(),
  status: z.string(),
  error: z.string().nullable(),
  createdAt: dateLike,
  updatedAt: dateLike,
});
export type DeepResearchRun = z.infer<typeof DeepResearchRunSchema>;

export const ProviderCredentialMaskedSchema = z.object({
  id: z.string().uuid(),
  provider: z.string(),
  label: z.string(),
  hasKey: z.boolean(),
  maskedKey: z.string(),
  baseUrl: z.string().nullable(),
  organization: z.string().nullable(),
  lastValidatedAt: dateLike.nullable(),
  validationStatus: z.string().nullable(),
  validationError: z.string().nullable(),
  createdAt: dateLike,
  updatedAt: dateLike,
});
export type ProviderCredentialMasked = z.infer<
  typeof ProviderCredentialMaskedSchema
>;

export const UserAiConfigSchema = z.object({
  userId: z.string(),
  chatProvider: z.string().nullable(),
  chatModel: z.string().nullable(),
  embeddingProvider: z.string().nullable(),
  embeddingModel: z.string().nullable(),
  embeddingDim: z.number().nullable(),
  onboardedAt: dateLike.nullable(),
  preferences: z.unknown().nullable(),
  updatedAt: dateLike,
  supportedEmbedDims: z.array(z.number()),
  isOnboarded: z.boolean(),
});

export const UserAiConfigUpdateResultSchema = z.object({
  userId: z.string(),
  chatProvider: z.string().nullable(),
  chatModel: z.string().nullable(),
  embeddingProvider: z.string().nullable(),
  embeddingModel: z.string().nullable(),
  embeddingDim: z.number().nullable(),
  onboardedAt: dateLike.nullable(),
  preferences: z.unknown().nullable(),
  updatedAt: dateLike,
  isOnboarded: z.boolean(),
});

export const ReembedStatusSchema = z.object({
  currentModel: z.string().nullable(),
  currentDim: z.number().nullable(),
});

export const ProviderCatalogSchema = z.object({
  providers: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      description: z.string().optional(),
      defaultBaseUrl: z.string().optional(),
      supportsCustomModels: z.boolean().optional(),
      chatModels: z.array(
        z.object({
          id: z.string(),
          label: z.string().optional(),
          description: z.string().optional(),
        }),
      ),
      embedModels: z.array(
        z.object({
          id: z.string(),
          label: z.string().optional(),
          embedDim: z.number().optional(),
          description: z.string().optional(),
        }),
      ),
    }),
  ),
  supportedEmbedDims: z.array(z.number()),
});

export const TestConnectionResultSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), latencyMs: z.number() }),
  z.object({ ok: z.literal(false), error: z.string() }),
]);

export const WebResultSchema = z.object({
  url: z.string(),
  title: z.string(),
  snippet: z.string(),
  publishedAt: z.string().optional(),
  source: z.string().optional(),
});

export const IdResultSchema = z.object({ id: z.string() });
export const NullableIdResultSchema = IdResultSchema.nullable();
