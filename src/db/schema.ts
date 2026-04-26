import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  vector,
} from "drizzle-orm/pg-core";

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [index("session_userId_idx").on(table.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index("account_userId_idx").on(table.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, {
    fields: [session.userId],
    references: [user.id],
  }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, {
    fields: [account.userId],
    references: [user.id],
  }),
}));

export const notebooks = pgTable("notebooks", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const sources = pgTable(
  "sources",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    notebookId: uuid("notebook_id")
      .notNull()
      .references(() => notebooks.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(), // "file" | "link" | "text" | "audio"
    title: text("title").notNull(),
    uri: text("uri"),
    content: text("content"),
    status: text("status").notNull().default("pending"), // pending | parsing | embedding | ready | error
    storageProvider: text("storage_provider"),
    storageKey: text("storage_key"),
    mimeType: text("mime_type"),
    size: integer("size"),
    error: text("error"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [index("sources_notebook_idx").on(table.notebookId)],
);

export const sourceChunks = pgTable(
  "source_chunks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => sources.id, { onDelete: "cascade" }),
    notebookId: uuid("notebook_id")
      .notNull()
      .references(() => notebooks.id, { onDelete: "cascade" }),
    ordinal: integer("ordinal").notNull(),
    content: text("content").notNull(),
    tokenCount: integer("token_count"),
    metadata: jsonb("metadata"),
    /**
     * Legacy 768-dim embedding column. Kept for the dual-write window so
     * existing retrieval code keeps working. Will be dropped in Phase 5
     * after every chunk has been migrated into one of the
     * `chunk_embeddings_<dim>` sibling tables.
     */
    embedding: vector("embedding", { dimensions: 768 }),
    /**
     * Pointer to the chunk's currently-active embedding. The actual vector
     * lives in `chunk_embeddings_<embeddingDim>` keyed on this chunk's id.
     * Null until the chunk has been embedded under the new system.
     */
    embeddingDim: integer("embedding_dim"),
    embeddingModel: text("embedding_model"),
    embeddingProvider: text("embedding_provider"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("chunks_source_idx").on(table.sourceId),
    index("chunks_notebook_idx").on(table.notebookId),
    index("chunks_embedding_dim_idx").on(table.notebookId, table.embeddingDim),
  ],
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    notebookId: uuid("notebook_id")
      .notNull()
      .references(() => notebooks.id, { onDelete: "cascade" }),
    role: text("role").notNull(), // user | assistant | system
    content: text("content").notNull(),
    citations: jsonb("citations"), // array of { chunkId, sourceId, snippet }
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("messages_notebook_idx").on(table.notebookId)],
);

export const notebookRelations = relations(notebooks, ({ one, many }) => ({
  owner: one(user, {
    fields: [notebooks.userId],
    references: [user.id],
  }),
  sources: many(sources),
  messages: many(messages),
}));

export const sourceRelations = relations(sources, ({ one, many }) => ({
  notebook: one(notebooks, {
    fields: [sources.notebookId],
    references: [notebooks.id],
  }),
  chunks: many(sourceChunks),
}));

export const sourceChunkRelations = relations(sourceChunks, ({ one }) => ({
  source: one(sources, {
    fields: [sourceChunks.sourceId],
    references: [sources.id],
  }),
  notebook: one(notebooks, {
    fields: [sourceChunks.notebookId],
    references: [notebooks.id],
  }),
}));

export const messageRelations = relations(messages, ({ one }) => ({
  notebook: one(notebooks, {
    fields: [messages.notebookId],
    references: [notebooks.id],
  }),
}));

export const deepResearchRuns = pgTable(
  "deep_research_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    notebookId: uuid("notebook_id")
      .notNull()
      .references(() => notebooks.id, { onDelete: "cascade" }),
    query: text("query").notNull(),
    mode: text("mode").notNull().default("deep"),
    plan: jsonb("plan"),
    sources: jsonb("sources"),
    report: text("report"),
    status: text("status").notNull().default("running"),
    error: text("error"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [index("deep_research_notebook_idx").on(table.notebookId)],
);

export const studioOutputs = pgTable(
  "studio_outputs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    notebookId: uuid("notebook_id")
      .notNull()
      .references(() => notebooks.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    content: jsonb("content"),
    assetUrl: text("asset_url"),
    status: text("status").notNull().default("ready"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("studio_outputs_notebook_idx").on(table.notebookId)],
);

/* ------------------------------------------------------------------ */
/*  AI provider settings (multi-provider, per-user, encrypted-at-rest)  */
/* ------------------------------------------------------------------ */

/**
 * Encrypted credentials for an external AI provider (OpenAI, Anthropic, etc.).
 * One user can have many credentials -- e.g. a personal OpenAI key and a
 * work OpenAI key, distinguished by `label`.
 *
 * The plaintext API key never lives in this table -- we store the AES-GCM
 * ciphertext, IV, and auth tag separately. AAD = userId at encrypt time.
 */
export const userProviderCredentials = pgTable(
  "user_provider_credentials",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(), // ProviderId from src/lib/ai/providers.ts
    label: text("label").notNull().default("default"),
    apiKeyCiphertext: text("api_key_ciphertext"), // base64
    apiKeyIv: text("api_key_iv"), // base64
    apiKeyTag: text("api_key_tag"), // base64
    apiKeyKeyVersion: integer("api_key_key_version").notNull().default(1),
    baseUrl: text("base_url"),
    organization: text("organization"),
    lastValidatedAt: timestamp("last_validated_at"),
    validationStatus: text("validation_status"), // "ok" | "invalid" | "rate_limited" | "unknown"
    validationError: text("validation_error"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    index("user_credentials_user_idx").on(t.userId),
    uniqueIndex("user_credentials_user_provider_label_idx").on(
      t.userId,
      t.provider,
      t.label,
    ),
  ],
);

/**
 * One row per user holding their currently-active model selections.
 * Created on signup via the better-auth `user.create.after` hook.
 *
 * `onboardedAt` is null until the user picks a chat provider/model AND an
 * embedding provider/model in the settings dashboard. The onboarding gate
 * checks for this.
 */
export const userAiConfig = pgTable("user_ai_config", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  chatProvider: text("chat_provider"),
  chatModel: text("chat_model"),
  embeddingProvider: text("embedding_provider"),
  embeddingModel: text("embedding_model"),
  embeddingDim: integer("embedding_dim"),
  onboardedAt: timestamp("onboarded_at"),
  preferences: jsonb("preferences"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

/* ------------------------------------------------------------------ */
/*  Multi-dimension embedding tables                                    */
/*                                                                      */
/*  Each chunk's currently-active embedding lives in the table matching */
/*  its `source_chunks.embeddingDim`. Switching embedding models is     */
/*  non-destructive: old rows in other dim tables stay around.          */
/*  HNSW cosine indexes are created via src/db/migrate-vector-indexes.ts*/
/* ------------------------------------------------------------------ */

export const chunkEmbeddings768 = pgTable(
  "chunk_embeddings_768",
  {
    chunkId: uuid("chunk_id")
      .primaryKey()
      .references(() => sourceChunks.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    embedding: vector("embedding", { dimensions: 768 }).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("chunk_embeddings_768_model_idx").on(t.model)],
);

export const chunkEmbeddings1024 = pgTable(
  "chunk_embeddings_1024",
  {
    chunkId: uuid("chunk_id")
      .primaryKey()
      .references(() => sourceChunks.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    embedding: vector("embedding", { dimensions: 1024 }).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("chunk_embeddings_1024_model_idx").on(t.model)],
);

export const chunkEmbeddings1536 = pgTable(
  "chunk_embeddings_1536",
  {
    chunkId: uuid("chunk_id")
      .primaryKey()
      .references(() => sourceChunks.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    embedding: vector("embedding", { dimensions: 1536 }).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("chunk_embeddings_1536_model_idx").on(t.model)],
);

export const chunkEmbeddings3072 = pgTable(
  "chunk_embeddings_3072",
  {
    chunkId: uuid("chunk_id")
      .primaryKey()
      .references(() => sourceChunks.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    embedding: vector("embedding", { dimensions: 3072 }).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("chunk_embeddings_3072_model_idx").on(t.model)],
);

export const userAiConfigRelations = relations(userAiConfig, ({ one }) => ({
  user: one(user, {
    fields: [userAiConfig.userId],
    references: [user.id],
  }),
}));

export const userProviderCredentialsRelations = relations(
  userProviderCredentials,
  ({ one }) => ({
    user: one(user, {
      fields: [userProviderCredentials.userId],
      references: [user.id],
    }),
  }),
);

export type Notebook = typeof notebooks.$inferSelect;
export type Source = typeof sources.$inferSelect;
export type SourceChunk = typeof sourceChunks.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type DeepResearchRun = typeof deepResearchRuns.$inferSelect;
export type StudioOutput = typeof studioOutputs.$inferSelect;
export type UserProviderCredential =
  typeof userProviderCredentials.$inferSelect;
export type UserAiConfig = typeof userAiConfig.$inferSelect;
