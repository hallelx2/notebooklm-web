import { createAuth } from "@notebooklm/core/auth";
import { bindCoreRuntime } from "@notebooklm/core/runtime";
import { db } from "@/db";

// Bind the core runtime as a side-effect of the first import of auth.
// Every server entry point pulls @/lib/auth (or @/db, which also calls
// bindCoreRuntime) before invoking core libraries, so the binding always
// happens before first use.
bindCoreRuntime({ db });

const trustedOrigins = ["http://localhost:3000"];
if (process.env.BETTER_AUTH_URL) trustedOrigins.push(process.env.BETTER_AUTH_URL);
if (process.env.NEXT_PUBLIC_BETTER_AUTH_URL)
  trustedOrigins.push(process.env.NEXT_PUBLIC_BETTER_AUTH_URL);
if (process.env.VERCEL_URL)
  trustedOrigins.push(`https://${process.env.VERCEL_URL}`);
if (process.env.VERCEL_PROJECT_PRODUCTION_URL)
  trustedOrigins.push(`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`);

const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;

export const auth = createAuth({
  db,
  baseURL: process.env.BETTER_AUTH_URL,
  trustedOrigins,
  google:
    googleClientId && googleClientSecret
      ? { clientId: googleClientId, clientSecret: googleClientSecret }
      : undefined,
});
