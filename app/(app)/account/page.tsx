import { requireMember } from "@/lib/session";
import AccountForm from "./account-form";

export default async function AccountPage() {
  const me = await requireMember();
  return (
    <main className="mx-auto w-full max-w-sm px-4 py-10">
      <h1 className="mb-1 text-2xl font-semibold">Account</h1>
      <p className="mb-6 text-sm text-zinc-500">{me.user.email}</p>
      <AccountForm name={me.user.name} />
    </main>
  );
}

// Per-request auth + DB data; nothing to prerender.
export const instant = false;
