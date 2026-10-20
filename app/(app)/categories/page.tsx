import { prisma } from "@/lib/db";
import { requireMember } from "@/lib/session";
import { createCategory, moveCategory, setCategoryArchived, setWatchers, updateCategory } from "@/lib/actions";

export default async function CategoriesPage() {
  const me = await requireMember("OWNER");
  const [categories, members] = await Promise.all([
    prisma.category.findMany({
      where: { workspaceId: me.workspaceId },
      include: { watchers: true },
      orderBy: { position: "asc" },
    }),
    prisma.member.findMany({ where: { workspaceId: me.workspaceId }, include: { user: { select: { name: true } } } }),
  ]);
  const active = categories.filter((c) => !c.archivedAt);
  const archived = categories.filter((c) => c.archivedAt);
  const leaders = members.filter((m) => m.role === "LEADERSHIP").map((m) => m.user.name);

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10">
      <h1 className="mb-2 text-2xl font-semibold">Categories</h1>
      <p className="mb-8 text-sm text-zinc-500">
        Leadership ({leaders.join(", ") || "nobody yet"}) follows every task automatically.
        Watchers also auto-follow every task in their category.
      </p>

      <form action={createCategory} className="mb-8 flex flex-wrap gap-2">
        <input name="name" required maxLength={40} placeholder="New category, e.g. Editing" aria-label="Category name" className="flex-1 rounded border px-3 py-2" />
        <input name="color" type="color" defaultValue="#6366f1" aria-label="Category color" className="h-10 w-12" />
        <button className="rounded bg-black px-3 py-2 text-white dark:bg-white dark:text-black">Add category</button>
      </form>

      <div className="space-y-6">
        {active.map((c, i) => {
          const watching = new Set(c.watchers.map((w) => w.userId));
          return (
            <section key={c.id} aria-label={c.name} className="rounded border p-4" style={{ borderLeft: `4px solid ${c.color}` }}>
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <form action={updateCategory} className="flex flex-1 gap-2">
                  <input type="hidden" name="id" value={c.id} />
                  <input name="name" defaultValue={c.name} required maxLength={40} aria-label="Name" className="flex-1 rounded border px-2 py-1 font-medium" />
                  <input name="color" type="color" defaultValue={c.color} aria-label="Color" className="h-8 w-10" />
                  <button className="text-sm underline">Rename</button>
                </form>
                {(["up", "down"] as const).map((dir) => (
                  <form key={dir} action={moveCategory}>
                    <input type="hidden" name="id" value={c.id} />
                    <input type="hidden" name="dir" value={dir} />
                    <button disabled={dir === "up" ? i === 0 : i === active.length - 1} aria-label={`Move ${c.name} ${dir}`} className="rounded border px-2 disabled:opacity-30">
                      {dir === "up" ? "↑" : "↓"}
                    </button>
                  </form>
                ))}
                <form action={setCategoryArchived}>
                  <input type="hidden" name="id" value={c.id} />
                  <input type="hidden" name="archived" value="1" />
                  <button className="text-sm text-red-600 underline">Archive</button>
                </form>
              </div>

              <form action={setWatchers}>
                <input type="hidden" name="categoryId" value={c.id} />
                <fieldset className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                  <legend className="mb-2 text-zinc-500">Watchers</legend>
                  {members.filter((m) => m.role !== "LEADERSHIP").map((m) => (
                    <label key={m.userId} className="flex items-center gap-1">
                      <input type="checkbox" name="userIds" value={m.userId} defaultChecked={watching.has(m.userId)} />
                      {m.user.name}
                    </label>
                  ))}
                </fieldset>
                <button className="mt-3 text-sm underline">Save watchers</button>
              </form>
            </section>
          );
        })}
      </div>

      {archived.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-3 font-semibold">Archived</h2>
          <ul className="space-y-2 text-sm">
            {archived.map((c) => (
              <li key={c.id} className="flex items-center justify-between rounded border px-3 py-2">
                {c.name}
                <form action={setCategoryArchived}>
                  <input type="hidden" name="id" value={c.id} />
                  <input type="hidden" name="archived" value="0" />
                  <button className="underline">Restore</button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}

// Per-request auth + DB data; nothing to prerender.
export const instant = false;
