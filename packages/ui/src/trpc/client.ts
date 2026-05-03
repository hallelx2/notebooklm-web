import { createTRPCReact } from "@trpc/react-query";
import type { AppRouter } from "@notebooklm/server";

export const trpc = createTRPCReact<AppRouter>();
