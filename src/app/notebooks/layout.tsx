import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { userAiConfig } from "@/db/schema";
import { requireSession } from "@/lib/auth-server";

/**
 * Onboarding gate for the entire `/notebooks/*` tree. If the user has not
 * completed AI provider setup (chat + embedding), bounce them to the
 * settings page with `?onboarding=1` so the UI can show the right copy.
 *
 * The settings tree itself is intentionally not gated -- otherwise users
 * would have no way out of the redirect loop.
 */
export default async function NotebooksLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireSession();
  const [cfg] = await db
    .select()
    .from(userAiConfig)
    .where(eq(userAiConfig.userId, session.user.id))
    .limit(1);

  const onboarded =
    cfg?.onboardedAt &&
    cfg.chatProvider &&
    cfg.chatModel &&
    cfg.embeddingProvider &&
    cfg.embeddingModel &&
    cfg.embeddingDim;

  if (!onboarded) {
    redirect("/settings/providers?onboarding=1");
  }

  return <>{children}</>;
}
