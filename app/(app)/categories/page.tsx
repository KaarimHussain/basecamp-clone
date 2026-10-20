import { prisma } from "@/lib/db";
import { requireMember } from "@/lib/session";
import { setWatchers } from "@/lib/actions";

export default async function CategoriesPage() {
  const me = await requireMember("OWNER");
  const [categories, members] = await Promise.all([
    prisma.category.findMany({
      where: { workspaceId: me.workspaceId, archivedAt: null },
      include: { watchers: true },
      orderBy: { position: "asc" },
    }),
    prisma.member.findMany({ where: { workspaceId: me.workspaceId }, include: { user: { select: { name: true } } } }),
  ]);
  const leaders = members.filter((m) => m.role === "LEADERSHIP").map((m) => m.user.name);

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10">
      <h1 className="mb-2 text-2xl font-semibold">Category watchers</h1>
      <p className="mb-8 text-sm text-zinc-500">
        Leadership ({leaders.join(", ") || "nobody yet"}) follows every task automatically.
        Watchers below also auto-follow every task in that category, on top of leadership.
      </p>

      <div className="space-y-6">
        {categories.map((c) => {
          const watching = new Set(c.watchers.map((w) => w.userId));
          return (
            <form key={c.id} action={setWatchers} className="rounded border p-4" style={{ borderLeft: `4px solid ${c.color}` }}>
              <input type="hidden" name="categoryId" value={c.id} />
              <fieldset className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                <legend className="mb-2 font-medium">{c.name}</legend>
                {members.filter((m) => m.role !== "LEADERSHIP").map((m) => (
                  <label key={m.userId} className="flex items-center gap-1">
                    <input type="checkbox" name="userIds" value={m.userId} defaultChecked={watching.has(m.userId)} />
                    {m.user.name}
                  </label>
                ))}
              </fieldset>
              <button className="mt-3 text-sm underline">Save watchers</button>
            </form>
          );
        })}
      </div>
    </main>
  );
}

// Per-request auth + DB data; nothing to prerender.
export const instant = false;
