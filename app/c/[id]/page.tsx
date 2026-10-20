import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireMember } from "@/lib/session";
import { createTask } from "@/lib/tasks";
import { PRIORITIES, STATUSES, TaskFields } from "@/app/task-fields";
import Board from "./board";

export default async function CategoryPage({ params, searchParams }: PageProps<"/c/[id]">) {
  const me = await requireMember();
  const { id } = await params;
  const view = (await searchParams).view === "board" ? "board" : "list";

  const [category, tasks, members] = await Promise.all([
    prisma.category.findFirst({ where: { id, workspaceId: me.workspaceId } }),
    prisma.task.findMany({
      where: { categoryId: id, workspaceId: me.workspaceId, archivedAt: null },
      include: { assignees: { include: { user: { select: { name: true } } } } },
      orderBy: { position: "asc" },
    }),
    prisma.member.findMany({ where: { workspaceId: me.workspaceId }, include: { user: { select: { name: true } } } }),
  ]);
  if (!category) notFound();

  const rows = tasks.map((t) => ({
    id: t.id,
    title: t.title,
    status: t.status,
    priority: t.priority,
    dueAt: t.dueAt?.toISOString().slice(0, 10) ?? null,
    assignees: t.assignees.map((a) => a.user.name),
  }));

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-10">
      <Link href="/" className="text-sm underline">← All categories</Link>
      <header className="my-6 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold" style={{ color: category.color }}>{category.name}</h1>
        <nav className="flex gap-1 text-sm">
          {(["list", "board"] as const).map((v) => (
            <Link key={v} href={`?view=${v}`} aria-current={view === v ? "page" : undefined}
              className={`rounded px-3 py-1 capitalize ${view === v ? "bg-black text-white dark:bg-white dark:text-black" : "border"}`}>
              {v}
            </Link>
          ))}
        </nav>
      </header>

      <details className="mb-8 rounded border p-4">
        <summary className="cursor-pointer font-medium">New task</summary>
        <form action={createTask} className="mt-4 flex flex-col gap-3">
          <input type="hidden" name="categoryId" value={category.id} />
          <TaskFields members={members} />
          <button className="self-start rounded bg-black px-3 py-2 text-white dark:bg-white dark:text-black">Add task</button>
        </form>
      </details>

      {view === "board" ? (
        <Board tasks={rows} />
      ) : rows.length === 0 ? (
        <p className="text-zinc-500">No tasks yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-zinc-500">
              <tr><th className="py-2">Task</th><th>Status</th><th>Priority</th><th>Due</th><th>Assignees</th></tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t.id} className="border-t">
                  <td className="py-2"><Link href={`/t/${t.id}`} className="underline">{t.title}</Link></td>
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
