import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UserAvatar } from "@/components/user-avatar";

export const STATUSES = [
  { value: "TODO", label: "To do", color: "oklch(0.7 0.02 80)" },
  { value: "IN_PROGRESS", label: "In progress", color: "oklch(0.65 0.15 250)" },
  { value: "REVIEW", label: "Review", color: "oklch(0.78 0.15 80)" },
  { value: "DONE", label: "Done", color: "oklch(0.62 0.15 152)" },
] as const;

export const PRIORITIES = ["None", "Low", "Medium", "High"];

// Native selects keep forms working without JS; styled to sit next to shadcn inputs.
export const selectClass =
  "h-9 rounded-md border border-input bg-card px-2.5 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

type Member = { userId: string; user: { name: string } };
type Defaults = {
  title?: string;
  status?: string;
  priority?: number;
  dueAt?: Date | null;
  assigneeIds?: string[];
  tagIds?: string[];
};
type Tag = { id: string; name: string; color: string };

// Checkbox rendered as a toggleable pill (selected = filled).
const pill =
  "flex cursor-pointer items-center gap-1.5 rounded-full border bg-card py-1 pr-3 pl-1 text-sm transition-colors select-none hover:bg-secondary has-[:checked]:border-primary has-[:checked]:bg-primary/10 has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50";

// Shared by the new-task form and the task detail page.
export function TaskFields({ members, tags = [], task = {}, autoFocus }: { members: Member[]; tags?: Tag[]; task?: Defaults; autoFocus?: boolean }) {
  return (
    <>
      <Input
        name="title"
        defaultValue={task.title}
        placeholder="Describe this to-do…"
        required
        aria-label="Title"
        autoFocus={autoFocus}
        className="h-11 text-base font-semibold md:text-lg"
      />
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="f-status">Status</Label>
          <select id="f-status" name="status" defaultValue={task.status ?? "TODO"} className={selectClass}>
            {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="f-priority">Priority</Label>
          <select id="f-priority" name="priority" defaultValue={task.priority ?? 0} className={selectClass}>
            {PRIORITIES.map((p, i) => <option key={p} value={i}>{p}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="f-due">Due on</Label>
          <Input id="f-due" type="date" name="dueAt" defaultValue={task.dueAt?.toISOString().slice(0, 10)} />
        </div>
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">Assigned to</legend>
        <div className="flex flex-wrap gap-2">
          {members.map((m) => (
            <label key={m.userId} className={pill}>
              <input type="checkbox" name="assigneeIds" value={m.userId} defaultChecked={task.assigneeIds?.includes(m.userId)} className="sr-only" />
              <UserAvatar id={m.userId} name={m.user.name} size="sm" />
              {m.user.name}
            </label>
          ))}
        </div>
      </fieldset>
      {tags.length > 0 && (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-medium">Tags</legend>
          <div className="flex flex-wrap gap-2">
            {tags.map((t) => (
              <label key={t.id} className={`${pill} pl-2`}>
                <input type="checkbox" name="tagIds" value={t.id} defaultChecked={task.tagIds?.includes(t.id)} className="sr-only" />
                <span className="size-2.5 rounded-full" style={{ background: t.color }} aria-hidden />
                {t.name}
              </label>
            ))}
          </div>
        </fieldset>
      )}
    </>
  );
}

export function TagChip({ tag }: { tag: Tag }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
      style={{ background: `color-mix(in oklch, ${tag.color} 18%, transparent)`, color: `color-mix(in oklch, ${tag.color} 75%, var(--foreground))` }}
    >
      <span className="size-1.5 rounded-full" style={{ background: tag.color }} aria-hidden />
      {tag.name}
    </span>
  );
}

export function StatusDot({ status }: { status: string }) {
  const s = STATUSES.find((x) => x.value === status);
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
      <span className="size-2 rounded-full" style={{ background: s?.color }} aria-hidden />
      {s?.label}
    </span>
  );
}
