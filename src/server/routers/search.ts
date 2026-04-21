import { z } from "zod";
import { webSearch } from "@/lib/search";
import { protectedProcedure, router } from "../trpc";

export const searchRouter = router({
  web: protectedProcedure
    .input(
      z.object({
        query: z.string().min(1),
        mode: z.enum(["fast", "deep"]).default("fast"),
        limit: z.number().int().min(1).max(20).default(8),
      }),
    )
    .mutation(async ({ input }) => {
      return webSearch(input.query, input.mode, input.limit);
    }),
});
