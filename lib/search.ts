import "server-only";
import { prisma } from "@/lib/db";

export type Hit = { kind: "task" | "comment" | "message"; id: string; href: string; title: string; snippet: string; at: Date };

// Escape LIKE wildcards so "50%" searches for a literal percent sign.
const like = (q: string) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

// Rich text is Tiptap JSON: search only the "text" leaves, never node names or attribute ids.
// ponytail: sequential ILIKE scans; fine for thousands of rows, add pg_trgm/tsvector indexes if it slows down.
export async function search(me: { workspaceId: string; userId: string }, q: string): Promise<Hit[]> {
  const pattern = like(q);
  const [tasks, comments, messages] = await Promise.all([
    prisma.$queryRaw<{ id: string; title: string; snippet: string | null; at: Date }[]>`
      SELECT t.id, t.title, d.txt AS snippet, t."createdAt" AS at
      FROM "Task" t
      LEFT JOIN LATERAL (
        SELECT x #>> '{}' AS txt FROM jsonb_path_query(COALESCE(t.description, '{}'::jsonb), 'strict $.**.text') x
        WHERE x #>> '{}' ILIKE ${pattern} LIMIT 1
      ) d ON true
      WHERE t."workspaceId" = ${me.workspaceId} AND t."archivedAt" IS NULL
        AND (t.title ILIKE ${pattern} OR d.txt IS NOT NULL)
      ORDER BY t."createdAt" DESC LIMIT 20`,
    prisma.$queryRaw<{ id: string; taskId: string; title: string; snippet: string; at: Date }[]>`
      SELECT c.id, c."taskId", t.title, m.txt AS snippet, c."createdAt" AS at
      FROM "Comment" c
      JOIN "Task" t ON t.id = c."taskId"
      JOIN LATERAL (
        SELECT x #>> '{}' AS txt FROM jsonb_path_query(c.body, 'strict $.**.text') x
        WHERE x #>> '{}' ILIKE ${pattern} LIMIT 1
      ) m ON true
      WHERE t."workspaceId" = ${me.workspaceId} AND t."archivedAt" IS NULL
      ORDER BY c."createdAt" DESC LIMIT 20`,
    // Only channels this member can see: public ones, or private/DM they're in.
    prisma.$queryRaw<{ id: string; channelId: string; name: string; kind: string; snippet: string; at: Date }[]>`
      SELECT m.id, m."channelId", ch.name, ch.kind::text AS kind, m.body->>'text' AS snippet, m."createdAt" AS at
      FROM "Message" m
      JOIN "Channel" ch ON ch.id = m."channelId"
      WHERE ch."workspaceId" = ${me.workspaceId}
        AND (ch.kind = 'PUBLIC' OR EXISTS (SELECT 1 FROM "ChannelMember" cm WHERE cm."channelId" = ch.id AND cm."userId" = ${me.userId}))
        AND m.body->>'text' ILIKE ${pattern}
      ORDER BY m."createdAt" DESC LIMIT 20`,
  ]);

  return [
    ...tasks.map((t) => ({ kind: "task" as const, id: t.id, href: `/t/${t.id}`, title: t.title, snippet: t.snippet ?? "", at: t.at })),
    ...comments.map((c) => ({ kind: "comment" as const, id: c.id, href: `/t/${c.taskId}`, title: c.title, snippet: c.snippet, at: c.at })),
    ...messages.map((m) => ({
      kind: "message" as const,
      id: m.id,
      href: `/chat/${m.channelId}`,
      title: m.kind === "DM" ? "Direct message" : `#${m.name}`,
      snippet: m.snippet,
      at: m.at,
    })),
  ];
}
