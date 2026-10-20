import Link from "next/link";
import { CheckSquare, MessageSquare, MessagesSquare, Search } from "lucide-react";
import { requireMember } from "@/lib/session";
import { search, type Hit } from "@/lib/search";
import { relative } from "@/lib/format";
import { EmptyState, PageContainer, PageHeader, Paper } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const metadata = { title: "Find" };

const GROUPS: { kind: Hit["kind"]; label: string; icon: typeof Search }[] = [
  { kind: "task", label: "To-dos", icon: CheckSquare },
  { kind: "comment", label: "Comments", icon: MessageSquare },
  { kind: "message", label: "Chat", icon: MessagesSquare },
];

// Bold the matched part of a snippet (case-insensitive), trimmed around the first match.
function Highlight({ text, q }: { text: string; q: string }) {
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return <>{text.slice(0, 160)}</>;
  const start = Math.max(0, i - 60);
  return (
    <>
      {start > 0 && "…"}{text.slice(start, i)}
      <mark className="rounded bg-highlight/60 px-0.5 text-foreground">{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length, i + q.length + 100)}
    </>
  );
}

export default async function SearchPage({ searchParams }: PageProps<"/search">) {
  const me = await requireMember();
  const raw = (await searchParams).q;
  const q = typeof raw === "string" ? raw.trim().slice(0, 100) : "";
  const hits = q.length >= 2 ? await search(me, q) : [];

  return (
    <PageContainer size="narrow">
      <PageHeader title="Find" subtitle="Search to-dos, notes, comments and chat." />
      <form className="mb-8 flex gap-2" role="search">
        <Input name="q" defaultValue={q} placeholder="Search for anything…" aria-label="Search" autoFocus className="h-11 text-base" />
        <Button type="submit" size="lg" className="h-11"><Search /> Find</Button>
      </form>

      {q.length < 2 ? (
        <EmptyState icon={<Search />} title="Type at least two letters" />
      ) : hits.length === 0 ? (
        <EmptyState icon={<Search />} title={`Nothing matches “${q}”`}>Try a different word.</EmptyState>
      ) : (
        <div className="flex flex-col gap-8">
          {GROUPS.map(({ kind, label, icon: Icon }) => {
            const rows = hits.filter((h) => h.kind === kind);
            if (rows.length === 0) return null;
            return (
              <section key={kind}>
                <h2 className="mb-2 flex items-center gap-2 text-xs font-bold tracking-wide text-muted-foreground uppercase">
                  <Icon className="size-4" aria-hidden />{label} <span className="font-normal">({rows.length})</span>
                </h2>
                <Paper className="divide-y">
                  {rows.map((h) => (
                    <Link key={h.id} href={h.href} className="block px-5 py-3 text-sm transition-colors first:rounded-t-2xl last:rounded-b-2xl hover:bg-secondary/60">
                      <div className="flex items-baseline gap-2">
                        <span className="font-semibold"><Highlight text={h.title} q={kind === "task" ? q : "\u0000"} /></span>
                        <time className="ml-auto shrink-0 text-xs text-muted-foreground">{relative(h.at)}</time>
                      </div>
                      {h.snippet && <p className="mt-0.5 line-clamp-2 text-muted-foreground"><Highlight text={h.snippet} q={q} /></p>}
                    </Link>
                  ))}
                </Paper>
              </section>
            );
          })}
        </div>
      )}
    </PageContainer>
  );
}

// Per-request auth + DB data; nothing to prerender.
export const instant = false;
