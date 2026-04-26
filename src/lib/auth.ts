import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "../db";
import { userAiConfig } from "../db/schema";

const trustedOrigins = ["http://localhost:3000"];
if (process.env.BETTER_AUTH_URL) {
  trustedOrigins.push(process.env.BETTER_AUTH_URL);
}
if (process.env.NEXT_PUBLIC_BETTER_AUTH_URL) {
  trustedOrigins.push(process.env.NEXT_PUBLIC_BETTER_AUTH_URL);
}
// Also trust the Vercel deployment URL
if (process.env.VERCEL_URL) {
  trustedOrigins.push(`https://${process.env.VERCEL_URL}`);
}
if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
  trustedOrigins.push(`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`);
}

const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg" }),
  baseURL: process.env.BETTER_AUTH_URL,
  trustedOrigins,
  emailAndPassword: { enabled: true },
  ...(googleClientId && googleClientSecret
    ? {
        socialProviders: {
          google: {
            clientId: googleClientId,
            clientSecret: googleClientSecret,
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
