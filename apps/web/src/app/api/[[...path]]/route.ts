import { createApp } from "@notebooklm/server";
import { webAdapter } from "@/lib/platform-adapter";

export const runtime = "nodejs";
export const maxDuration = 300;

const app = createApp(webAdapter);

const handler = (req: Request) => app.fetch(req);

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
export const OPTIONS = handler;
