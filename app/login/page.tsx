"use client";

import { useActionState } from "react";
import { login } from "@/lib/actions";

export default function LoginPage() {
  const [error, action, pending] = useActionState(login, undefined);
  return (
    <main className="mx-auto mt-24 w-full max-w-sm px-4">
      <h1 className="mb-6 text-2xl font-semibold">Sign in to TFG Workspace</h1>
      <form action={action} className="flex flex-col gap-3">
        <input name="email" type="email" placeholder="Email" required autoComplete="email" className="rounded border px-3 py-2" />
        <input name="password" type="password" placeholder="Password" required autoComplete="current-password" className="rounded border px-3 py-2" />
        {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
        <button disabled={pending} className="rounded bg-black px-3 py-2 text-white disabled:opacity-50">
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}
