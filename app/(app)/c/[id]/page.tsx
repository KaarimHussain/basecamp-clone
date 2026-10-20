import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireMember } from "@/lib/session";
import { createTask } from "@/lib/tasks";
import { PRIORITIES, STATUSES, TagChip, TaskFields } from "@/app/task-fields";
import Board from "./board";

// Query string from the defined entries only, so filters survive a view switch.
const qs = (p: Record<string, string | undefined>) =>
  `?${new URLSearchParams(Object.entries(p).filter((e): e is [string, string] => !!e[1]))}`;

export default async function CategoryPage({ params, searchParams }: PageProps<"/c/[id]">) {
  const me = await requireMember();
  const { id } = await params;
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (typeof v === "string" && v ? v : undefined);
  const view = sp.view === "board" ? "board" : "list";
  const filter = { tag: one(sp.tag), status: one(sp.status), assignee: one(sp.assignee) };
  const status = STATUSES.find((s) => s.value === filter.status)?.value;

  const [category, tasks, members, tags] = await Promise.all([
    prisma.category.findFirst({ where: { id, workspaceId: me.workspaceId } }),
    prisma.task.findMany({
      where: {
        categoryId: id,
        workspaceId: me.workspaceId,
        archivedAt: null,
        ...(status && { status }),
        ...(filter.tag && { tags: { some: { tagId: filter.tag } } }),
        ...(filter.assignee && { assignees: { some: { userId: filter.assignee } } }),
      },
      include: {
        assignees: { include: { user: { select: { name: true } } } },
        tags: { include: { tag: true } },
      },
      orderBy: { position: "asc" },
    }),
    prisma.member.findMany({ where: { workspaceId: me.workspaceId }, include: { user: { select: { name: true } } } }),
    prisma.tag.findMany({ where: { workspaceId: me.workspaceId }, orderBy: { name: "asc" } }),
  ]);
  if (!category) notFound();

  const rows = tasks.map((t) => ({
    id: t.id,
    title: t.title,
    status: t.status,
    priority: t.priority,
    dueAt: t.dueAt?.toISOString().slice(0, 10) ?? null,
    assignees: t.assignees.map((a) => a.user.name),
    tags: t.tags.map(({ tag }) => ({ id: tag.id, name: tag.name, color: tag.color })),
  }));
  const filtered = Object.values(filter).some(Boolean);

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-10">
      <Link href="/" className="text-sm underline">← All categories</Link>
      <header className="my-6 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold" style={{ color: category.color }}>{category.name}</h1>
        <nav className="flex gap-1 text-sm">
          {(["list", "board"] as const).map((v) => (
            <Link key={v} href={qs({ ...filter, view: v })} aria-current={view === v ? "page" : undefined}
              className={`rounded px-3 py-1 capitalize ${view === v ? "bg-black text-white dark:bg-white dark:text-black" : "border"}`}>
              {v}
            </Link>
          ))}
        </nav>
      </header>

      {category.archivedAt ? (
        <p className="mb-8 rounded border border-amber-500 p-3 text-sm">This category is archived. Its tasks are read-only history; an owner can restore it from Categories.</p>
      ) : (
      <details className="mb-8 rounded border p-4">
        <summary className="cursor-pointer font-medium">New task</summary>
        <form action={createTask} className="mt-4 flex flex-col gap-3">
          <input type="hidden" name="categoryId" value={category.id} />
          <TaskFields members={members} tags={tags} />
          <button className="self-start rounded bg-black px-3 py-2 text-white dark:bg-white dark:text-black">Add task</button>
        </form>
      </details>
      )}

      <form className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <input type="hidden" name="view" value={view} />
        <select name="tag" defaultValue={filter.tag ?? ""} aria-label="Filter by tag" className="rounded border px-2 py-1">
          <option value="">All tags</option>
          {tags.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        {view === "list" && (
          <select name="status" defaultValue={filter.status ?? ""} aria-label="Filter by status" className="rounded border px-2 py-1">
            <option value="">All statuses</option>
            {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        )}
        <select name="assignee" defaultValue={filter.assignee ?? ""} aria-label="Filter by assignee" className="rounded border px-2 py-1">
          <option value="">Anyone</option>
          {members.map((m) => <option key={m.userId} value={m.userId}>{m.user.name}</option>)}
        </select>
        <button className="rounded border px-2 py-1">Filter</button>
        {filtered && <Link href={`?view=${view}`} className="underline">Clear</Link>}
      </form>

      {view === "board" ? (
        <Board tasks={rows} />
      ) : rows.length === 0 ? (
        <p className="text-zinc-500">{filtered ? "No tasks match these filters." : "No tasks yet."}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-zinc-500">
              <tr><th className="py-2">Task</th><th>Tags</th><th>Status</th><th>Priority</th><th>Due</th><th>Assignees</th></tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t.id} className="border-t">
                  <td className="py-2"><Link href={`/t/${t.id}`} className="underline">{t.title}</Link></td>
                  <td><span className="flex flex-wrap gap-1">{t.tags.map((tag) => <TagChip key={tag.id} tag={tag} />)}</span></td>
                  <td>{STATUSES.find((s) => s.value === t.status)?.label}</td>
                  <td>{PRIORITIES[t.priority]}</td>
                  <td>{t.dueAt ?? "—"}</td>
                  <td>{t.assignees.join(", ") || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}

// Per-request auth + DB data; nothing to prerender.
export const instant = false;
