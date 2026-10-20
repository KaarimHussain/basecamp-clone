"use client";

import { useActionState } from "react";
import { acceptInvite } from "@/lib/actions";

export default function AcceptForm({ token }: { token: string }) {
  const [error, action, pending] = useActionState(acceptInvite, undefined);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="token" value={token} />
      <input name="name" placeholder="Your name" required className="rounded border px-3 py-2" />
      <input name="password" type="password" placeholder="Password (8+ chars)" required minLength={8} autoComplete="new-password" className="rounded border px-3 py-2" />
      {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
      <button disabled={pending} className="rounded bg-black px-3 py-2 text-white dark:bg-white dark:text-black disabled:opacity-50">
        {pending ? "Joining…" : "Create account"}
      </button>
    </form>
  );
}
