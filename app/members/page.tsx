import Link from "next/link";
import { headers } from "next/headers";
import { prisma } from "@/lib/db";
import { requireMember } from "@/lib/session";
import { createInvite, setRole } from "@/lib/actions";

export default async function MembersPage() {
  const me = await requireMember("OWNER");
  const [members, invites, h] = await Promise.all([
    prisma.member.findMany({ where: { workspaceId: me.workspaceId }, include: { user: true }, orderBy: { role: "asc" } }),
    prisma.invite.findMany({
      where: { workspaceId: me.workspaceId, acceptedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
    }),
    headers(),
  ]);
  const origin = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10">
      <Link href="/" className="text-sm underline">← Back</Link>
      <h1 className="my-6 text-2xl font-semibold">Members</h1>

      <table className="mb-10 w-full text-sm">
        <tbody>
          {members.map((m) => (
            <tr key={m.userId} className="border-b">
              <td className="py-2">{m.user.name}</td>
              <td className="break-all">{m.user.email}</td>
              <td className="text-right">
                {m.role === "OWNER" ? "owner" : (
                  <form action={setRole} className="inline-flex gap-2">
                    <input type="hidden" name="userId" value={m.userId} />
                    <select name="role" defaultValue={m.role} aria-label="Role" className="rounded border px-1">
                      <option value="LEADERSHIP">leadership</option>
                      <option value="MEMBER">member</option>
                    </select>
                    <button className="underline">Save</button>
                  </form>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 className="mb-3 text-lg font-semibold">Invite someone</h2>
      <form action={createInvite} className="mb-6 flex flex-wrap gap-2">
        <input name="email" type="email" placeholder="email@tfg.com" required aria-label="Email" className="flex-1 rounded border px-3 py-2" />
        <select name="role" aria-label="Role" className="rounded border px-2">
          <option value="MEMBER">member</option>
          <option value="LEADERSHIP">leadership</option>
        </select>
        <button className="rounded bg-black px-3 py-2 text-white">Create invite</button>
      </form>

      {invites.length > 0 && (
        <ul className="space-y-2 text-sm">
          {invites.map((i) => (
            <li key={i.id} className="rounded border p-2">
              <div>{i.email} · {i.role.toLowerCase()}</div>
              <code className="break-all text-xs text-zinc-500">{origin}/invite/{i.token}</code>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

// Per-request auth + DB data; nothing to prerender.
export const instant = false;
