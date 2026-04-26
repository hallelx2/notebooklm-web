import { initTRPC, TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { userAiConfig } from "@/db/schema";
import { auth } from "@/lib/auth";

export async function createContext(req: Request) {
  const session = await auth.api.getSession({ headers: req.headers });
  return {
    session: session?.session ?? null,
    user: session?.user ?? null,
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;

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
 * "NO_AI_CONFIG" when onboarding is incomplete; the client redirects the
 * user to /settings/providers in response.
 */
export const aiConfiguredProcedure = protectedProcedure.use(
  async ({ ctx, next }) => {
    const [cfg] = await db
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
