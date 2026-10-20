"use client";

import { useActionState } from "react";
import { updateAccount } from "@/lib/actions";

export default function AccountForm({ name }: { name: string }) {
  const [message, action, pending] = useActionState(updateAccount, undefined);
  return (
    <form action={action} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm">
        Name
        <input name="name" defaultValue={name} required maxLength={80} className="rounded border px-3 py-2" />
      </label>
      <fieldset className="mt-2 flex flex-col gap-2 text-sm">
        <legend className="mb-1 text-zinc-500">Change password (optional)</legend>
        <input name="current" type="password" placeholder="Current password" aria-label="Current password" autoComplete="current-password" className="rounded border px-3 py-2" />
        <input name="next" type="password" placeholder="New password (8+ chars)" aria-label="New password" minLength={8} autoComplete="new-password" className="rounded border px-3 py-2" />
      </fieldset>
      {message && <p role="status" className="text-sm">{message}</p>}
      <button disabled={pending} className="rounded bg-black px-3 py-2 text-white disabled:opacity-50 dark:bg-white dark:text-black">
        {pending ? "Saving…" : "Save"}
      </button>
    </form>
  );
}
