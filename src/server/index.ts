import { aiConfigRouter } from "./routers/aiConfig";
import { messageRouter } from "./routers/message";
import { notebookRouter } from "./routers/notebook";
import { providerRouter } from "./routers/provider";
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
  provider: providerRouter,
  aiConfig: aiConfigRouter,
});

export type AppRouter = typeof appRouter;
