import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireMember } from "@/lib/session";
import { logout } from "@/lib/actions";

export default async function Home() {
  const me = await requireMember();
  const categories = await prisma.category.findMany({
    where: { workspaceId: me.workspaceId, archivedAt: null },
    orderBy: { position: "asc" },
  });

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">{me.workspace.name}</h1>
        <div className="flex items-center gap-4 text-sm">
          <span>{me.user.name} · {me.role.toLowerCase()}</span>
          {me.role === "OWNER" && <Link href="/members" className="underline">Members</Link>}
          <form action={logout}><button className="underline">Sign out</button></form>
        </div>
      </header>
      <ul className="grid gap-3 sm:grid-cols-3">
        {categories.map((c) => (
          <li key={c.id} className="rounded border p-4" style={{ borderTop: `4px solid ${c.color}` }}>
            {c.name}
          </li>
        ))}
      </ul>
    </main>
  );
}

// Per-request auth + DB data; nothing to prerender.
export const instant = false;
