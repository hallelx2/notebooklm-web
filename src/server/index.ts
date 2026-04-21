import { messageRouter } from "./routers/message";
import { notebookRouter } from "./routers/notebook";
import { searchRouter } from "./routers/search";
import { sourceRouter } from "./routers/source";
import { router } from "./trpc";

export const appRouter = router({
  notebook: notebookRouter,
  source: sourceRouter,
  message: messageRouter,
  search: searchRouter,
});

export type AppRouter = typeof appRouter;
