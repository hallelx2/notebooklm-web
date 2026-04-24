import { redirectIfAuthenticated } from "@/lib/auth-server";
import { SignUpView } from "@/module/auth/views/SignUpView";

export default async function SignUpPage() {
  await redirectIfAuthenticated();
  return <SignUpView />;
}
