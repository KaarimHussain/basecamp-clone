import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { AuthShell } from "@/components/auth-shell";
import LoginForm from "./login-form";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const session = await auth();
  // Already signed in (and still a member)? Skip straight to the workspace.
  if (session?.user?.id && (await prisma.member.findFirst({ where: { userId: session.user.id } }))) redirect("/");
  const linkError = (await searchParams).error === "link";

  return (
    <AuthShell title="Welcome back" subtitle="Sign in to your team's workspace.">
      <LoginForm linkError={linkError} />
    </AuthShell>
  );
}

// Per-request auth; nothing to prerender.
export const instant = false;
