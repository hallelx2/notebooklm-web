import { router } from "./context";
import { aiConfigRouter } from "./routers/aiConfig";
import { messageRouter } from "./routers/message";
import { notebookRouter } from "./routers/notebook";
import { providerRouter } from "./routers/provider";
import { runtimesRouter } from "./routers/runtimes";
import { searchRouter } from "./routers/search";
import { searchConfigRouter } from "./routers/searchConfig";
import { sourceRouter } from "./routers/source";
import { studioRouter } from "./routers/studio";
import { ttsConfigRouter } from "./routers/ttsConfig";

export const appRouter = router({
  notebook: notebookRouter,
  source: sourceRouter,
  message: messageRouter,
  search: searchRouter,
  searchConfig: searchConfigRouter,
  studio: studioRouter,
  provider: providerRouter,
  aiConfig: aiConfigRouter,
  runtimes: runtimesRouter,
  ttsConfig: ttsConfigRouter,
});

export type AppRouter = typeof appRouter;
