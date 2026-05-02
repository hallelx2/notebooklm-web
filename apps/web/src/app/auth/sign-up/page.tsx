import { redirectIfAuthenticated } from "@/lib/auth-server";
import { SignUpView } from "@notebooklm/ui/views/auth/SignUpView";

export default async function SignUpPage() {
  await redirectIfAuthenticated();
  return <SignUpView />;
}
