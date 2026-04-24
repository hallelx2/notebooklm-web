import { redirectIfAuthenticated } from "@/lib/auth-server";
import { SignInView } from "@/module/auth/views/SignInView";

export default async function SignInPage() {
  await redirectIfAuthenticated();
  return <SignInView />;
}
