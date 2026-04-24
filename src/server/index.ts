import { messageRouter } from "./routers/message";
import { notebookRouter } from "./routers/notebook";
import { searchRouter } from "./routers/search";
import { sourceRouter } from "./routers/source";
import { studioRouter } from "./routers/studio";
import { router } from "./trpc";

export const appRouter = router({
  notebook: notebookRouter,
  source: sourceRouter,
  message: messageRouter,
  search: searchRouter,
  studio: studioRouter,
});

export type AppRouter = typeof appRouter;
