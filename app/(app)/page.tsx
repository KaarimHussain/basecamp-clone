import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireMember } from "@/lib/session";

export default async function Home() {
  const me = await requireMember();
  const categories = await prisma.category.findMany({
    where: { workspaceId: me.workspaceId, archivedAt: null },
    orderBy: { position: "asc" },
  });

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10">
      <h1 className="mb-6 text-2xl font-semibold">Categories</h1>
      <ul className="grid gap-3 sm:grid-cols-3">
        {categories.map((c) => (
          <li key={c.id}>
            <Link href={`/c/${c.id}`} className="block rounded border p-4 hover:bg-zinc-50 dark:hover:bg-zinc-900" style={{ borderTop: `4px solid ${c.color}` }}>
              {c.name}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}

// Per-request auth + DB data; nothing to prerender.
export const instant = false;
