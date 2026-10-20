export const STATUSES = [
  { value: "TODO", label: "To do" },
  { value: "IN_PROGRESS", label: "In progress" },
  { value: "REVIEW", label: "Review" },
  { value: "DONE", label: "Done" },
] as const;

export const PRIORITIES = ["None", "Low", "Medium", "High"];

type Member = { userId: string; user: { name: string } };
type Defaults = {
  title?: string;
  status?: string;
  priority?: number;
  dueAt?: Date | null;
  assigneeIds?: string[];
};

// Shared by the new-task form and the task detail page.
export function TaskFields({ members, task = {} }: { members: Member[]; task?: Defaults }) {
  return (
    <>
      <input name="title" defaultValue={task.title} placeholder="Task title" required aria-label="Title" className="rounded border px-3 py-2" />
      <div className="flex flex-wrap gap-2 text-sm">
        <select name="status" defaultValue={task.status ?? "TODO"} aria-label="Status" className="rounded border px-2 py-1">
          {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <select name="priority" defaultValue={task.priority ?? 0} aria-label="Priority" className="rounded border px-2 py-1">
          {PRIORITIES.map((p, i) => <option key={p} value={i}>{p} priority</option>)}
        </select>
        <input type="date" name="dueAt" defaultValue={task.dueAt?.toISOString().slice(0, 10)} aria-label="Due date" className="rounded border px-2 py-1" />
      </div>
      <fieldset className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        <legend className="mb-1 text-zinc-500">Assignees</legend>
        {members.map((m) => (
          <label key={m.userId} className="flex items-center gap-1">
            <input type="checkbox" name="assigneeIds" value={m.userId} defaultChecked={task.assigneeIds?.includes(m.userId)} />
            {m.user.name}
          </label>
        ))}
      </fieldset>
    </>
  );
}
