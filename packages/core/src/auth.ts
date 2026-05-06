import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import type { Database } from "./db";
import { userAiConfig } from "./db/schema";

export type CreateAuthOptions = {
  db: Database;
  baseURL?: string;
  trustedOrigins?: string[];
  google?: {
    clientId: string;
    clientSecret: string;
  };
  /**
   * Disable Better Auth's CSRF protection. Set this only when the
   * caller knows the origin can't be cross-site abused — the desktop
   * adapter, for instance, runs the API server on 127.0.0.1 only and
   * loads its renderer via `file://`, so every request arrives with
   * `Origin: null` and the default CSRF middleware rejects them with
   * "Missing or null Origin". Web apps should leave this off.
   */
  disableCSRFCheck?: boolean;
};

/**
 * Build a Better Auth instance against the supplied Drizzle client.
 *
 * Each application (web, desktop) constructs its own auth via this factory
 * so the database binding is explicit. The hook that seeds an empty
 * `user_ai_config` row on signup is centralised here.
 */
export function createAuth(opts: CreateAuthOptions) {
  const { db } = opts;
  const trustedOrigins = [...(opts.trustedOrigins ?? [])];
  if (opts.baseURL && !trustedOrigins.includes(opts.baseURL)) {
    trustedOrigins.push(opts.baseURL);
  }

  return betterAuth({
    database: drizzleAdapter(db, { provider: "pg" }),
    baseURL: opts.baseURL,
    trustedOrigins,
    advanced: opts.disableCSRFCheck ? { disableCSRFCheck: true } : undefined,
    emailAndPassword: { enabled: true },
    ...(opts.google
      ? {
          socialProviders: {
            google: {
              clientId: opts.google.clientId,
              clientSecret: opts.google.clientSecret,
            },
          },
        }
      : {}),
    /**
     * Insert an empty user_ai_config row whenever a new user is created so
     * the settings page and the onboarding gate have something to read.
     * `onboardedAt` stays null until the user finishes setup.
     */
    databaseHooks: {
      user: {
        create: {
          after: async (user) => {
            try {
              await db
                .insert(userAiConfig)
                .values({ userId: user.id })
                .onConflictDoNothing();
            } catch (err) {
              // Don't block signup if the row insert fails.
              console.error("user_ai_config insert hook failed", err);
            }
          },
        },
      },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
