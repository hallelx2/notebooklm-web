import { userAiConfig } from "@notebooklm/core/db/schema";
import { initTRPC, TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import type { PlatformAdapter } from "../adapter";

export type Context = {
  adapter: PlatformAdapter;
  session: { id: string; userId: string } | null;
  // biome-ignore lint/suspicious/noExplicitAny: Better Auth's user shape is per-deployment
  user: any | null;
};

export type CreateContextOptions = {
  request: Request;
  adapter: PlatformAdapter;
};

/**
 * Build the per-request tRPC context. Reads the session from Better Auth
 * using the adapter's auth instance, so the same code works against the
 * web's Neon-backed Better Auth and the desktop's PGlite-backed Better Auth.
 */
export async function createContext(
  opts: CreateContextOptions,
): Promise<Context> {
  const session = await opts.adapter.auth.api.getSession({
    headers: opts.request.headers,
  });
  return {
    adapter: opts.adapter,
    session: session?.session
      ? { id: session.session.id, userId: session.session.userId }
      : null,
    user: session?.user ?? null,
  };
}

const t = initTRPC.context<Context>().create();

export const router = t.router;
export const publicProcedure = t.procedure;
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});

/**
 * Procedure that requires the user to have completed AI provider onboarding
 * (chat + embedding configured). Throws PRECONDITION_FAILED with code
 * "NO_AI_CONFIG" when onboarding is incomplete.
 */
export const aiConfiguredProcedure = protectedProcedure.use(
  async ({ ctx, next }) => {
    const [cfg] = await ctx.adapter.db
      .select()
      .from(userAiConfig)
      .where(eq(userAiConfig.userId, ctx.user.id))
      .limit(1);
    if (
      !cfg?.onboardedAt ||
      !cfg.chatProvider ||
      !cfg.chatModel ||
      !cfg.embeddingProvider ||
      !cfg.embeddingModel ||
      !cfg.embeddingDim
    ) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "NO_AI_CONFIG",
      });
    }
    return next({ ctx: { ...ctx, aiConfig: cfg } });
  },
);
