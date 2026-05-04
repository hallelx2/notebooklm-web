import { webSearch } from "@notebooklm/core/search";
import { z } from "zod";
import { protectedProcedure, router } from "../context";
import { WebResultSchema } from "../schemas";

export const searchRouter = router({
  web: protectedProcedure
    .input(
      z.object({
        query: z.string().min(1),
        mode: z.enum(["fast", "deep"]).default("fast"),
        limit: z.number().int().min(1).max(20).default(8),
      }),
    )
    .output(z.array(WebResultSchema))
    .mutation(async ({ input, ctx }) => {
      return webSearch(input.query, input.mode, input.limit, {
        userId: ctx.user.id,
      });
    }),
});
