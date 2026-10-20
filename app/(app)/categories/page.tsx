import { ArchiveRestore, ArrowDown, ArrowUp, Archive, Eye } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireMember } from "@/lib/session";
import { createCategory, moveCategory, setCategoryArchived, setWatchers, updateCategory } from "@/lib/actions";
import { PageContainer, PageHeader, Paper, SectionTitle } from "@/components/page";
import { UserAvatar } from "@/components/user-avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const metadata = { title: "Categories" };

const pill =
  "flex cursor-pointer items-center gap-1.5 rounded-full border bg-card py-1 pr-3 pl-1 text-sm transition-colors select-none hover:bg-secondary has-[:checked]:border-primary has-[:checked]:bg-primary/10 has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50";

export default async function CategoriesPage() {
  const me = await requireMember("OWNER");
  const [categories, members] = await Promise.all([
    prisma.category.findMany({
      where: { workspaceId: me.workspaceId },
      include: { watchers: true, _count: { select: { tasks: { where: { archivedAt: null } } } } },
      orderBy: { position: "asc" },
    }),
    prisma.member.findMany({ where: { workspaceId: me.workspaceId }, include: { user: { select: { name: true } } } }),
  ]);
  const active = categories.filter((c) => !c.archivedAt);
  const archived = categories.filter((c) => c.archivedAt);
  const leaders = members.filter((m) => m.role === "LEADERSHIP");
  const watchable = members.filter((m) => m.role !== "LEADERSHIP");

  return (
    <PageContainer>
      <PageHeader
        title="Categories"
        subtitle="Departments that group your to-dos. Each one gets its own board and chat channel."
      />

      <Paper className="mb-8 p-5">
        <form action={createCategory} className="flex flex-wrap items-end gap-3">
          <label className="flex min-w-48 flex-1 flex-col gap-1.5 text-sm font-medium">
            New category
            <Input name="name" required maxLength={40} placeholder="e.g. Editing, Marketing, Printing" />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Color
            <input name="color" type="color" defaultValue="#6366f1" className="h-9 w-14 cursor-pointer rounded-md border bg-transparent p-1" />
          </label>
          <Button type="submit">Add category</Button>
        </form>
      </Paper>

      <div className="mb-6 flex items-center gap-2 rounded-xl bg-accent px-4 py-3 text-sm text-accent-foreground">
        <Eye className="size-4 shrink-0" aria-hidden />
        <span>
          <strong>Leadership</strong> ({leaders.map((l) => l.user.name).join(", ") || "nobody yet"}) automatically follows every to-do.
          Add <strong>watchers</strong> below to loop other people into a single department.
        </span>
      </div>

      <div className="flex flex-col gap-5">
        {active.map((c, i) => {
          const watching = new Set(c.watchers.map((w) => w.userId));
          return (
            <Paper key={c.id} className="overflow-hidden">
              <section aria-label={c.name}>
                <div className="h-1.5" style={{ background: c.color }} />
                <div className="flex flex-col gap-5 p-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <form action={updateCategory} className="flex min-w-60 flex-1 items-center gap-2">
                      <input type="hidden" name="id" value={c.id} />
                      <input name="color" type="color" defaultValue={c.color} aria-label="Color" className="h-9 w-10 shrink-0 cursor-pointer rounded-md border bg-transparent p-1" />
                      <Input name="name" defaultValue={c.name} required maxLength={40} aria-label="Name" className="h-9 font-semibold" />
                      <Button type="submit" variant="outline" size="sm">Save</Button>
                    </form>
                    <span className="text-xs text-muted-foreground">{c._count.tasks} to-dos</span>
                    {(["up", "down"] as const).map((dir) => (
                      <form key={dir} action={moveCategory}>
                        <input type="hidden" name="id" value={c.id} />
                        <input type="hidden" name="dir" value={dir} />
                        <Button type="submit" variant="ghost" size="icon-sm" disabled={dir === "up" ? i === 0 : i === active.length - 1} aria-label={`Move ${c.name} ${dir}`}>
                          {dir === "up" ? <ArrowUp /> : <ArrowDown />}
                        </Button>
                      </form>
                    ))}
                    <form action={setCategoryArchived}>
                      <input type="hidden" name="id" value={c.id} />
                      <input type="hidden" name="archived" value="1" />
                      <Button type="submit" variant="ghost" size="icon-sm" aria-label={`Archive ${c.name}`} className="hover:text-destructive"><Archive /></Button>
                    </form>
                  </div>

                  <form action={setWatchers} className="flex flex-col gap-2">
                    <input type="hidden" name="categoryId" value={c.id} />
                    <fieldset>
                      <legend className="mb-2 text-sm font-medium">Watchers</legend>
                      {watchable.length === 0 ? (
                        <p className="text-sm text-muted-foreground">Invite members first; leadership already follows everything.</p>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {watchable.map((m) => (
                            <label key={m.userId} className={pill}>
                              <input type="checkbox" name="userIds" value={m.userId} defaultChecked={watching.has(m.userId)} className="sr-only" />
                              <UserAvatar id={m.userId} name={m.user.name} size="sm" />
                              {m.user.name}
                            </label>
                          ))}
                        </div>
                      )}
                    </fieldset>
                    {watchable.length > 0 && <Button type="submit" variant="outline" size="sm" className="self-start">Save watchers</Button>}
                  </form>
                </div>
              </section>
            </Paper>
          );
        })}
      </div>

      {archived.length > 0 && (
        <section className="mt-10">
          <SectionTitle>Archived</SectionTitle>
          <Paper className="divide-y">
            {archived.map((c) => (
              <div key={c.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                <span className="size-2.5 rounded-full" style={{ background: c.color }} aria-hidden />
                <span className="flex-1 font-medium text-muted-foreground">{c.name}</span>
                <form action={setCategoryArchived}>
                  <input type="hidden" name="id" value={c.id} />
                  <input type="hidden" name="archived" value="0" />
                  <Button type="submit" variant="outline" size="sm"><ArchiveRestore /> Restore</Button>
                </form>
              </div>
            ))}
          </Paper>
        </section>
      )}
    </PageContainer>
  );
}

// Per-request auth + DB data; nothing to prerender.
export const instant = false;
