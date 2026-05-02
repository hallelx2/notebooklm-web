import { redirectIfAuthenticated } from "@/lib/auth-server";
import { SignInView } from "@notebooklm/ui/views/auth/SignInView";

export default async function SignInPage() {
  await redirectIfAuthenticated();
  return <SignInView />;
}
