import { headers } from "next/headers";
import { Link2, Mail, UserPlus } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireMember } from "@/lib/session";
import { createInvite, revokeInvite, setRole } from "@/lib/actions";
import PersonActions from "./person-actions";
import { relative } from "@/lib/format";
import { PageContainer, PageHeader, Paper, SectionTitle } from "@/components/page";
import { UserAvatar } from "@/components/user-avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { selectClass } from "@/app/task-fields";

export const metadata = { title: "People" };

const ROLE_ORDER = { OWNER: 0, LEADERSHIP: 1, MEMBER: 2 } as const;

export default async function MembersPage() {
  const me = await requireMember("OWNER");
  const [members, invites, h] = await Promise.all([
    prisma.member.findMany({ where: { workspaceId: me.workspaceId }, include: { user: true } }),
    prisma.invite.findMany({
      where: { workspaceId: me.workspaceId, acceptedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
    }),
    headers(),
  ]);
  const origin = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
  members.sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || a.user.name.localeCompare(b.user.name));

  return (
    <PageContainer>
      <PageHeader title="People" subtitle={`${members.length} ${members.length === 1 ? "person" : "people"} in ${me.workspace.name}. No seat limits.`} />

      <Paper className="mb-10 p-5">
        <h2 className="mb-3 flex items-center gap-2 font-bold"><UserPlus className="size-5" aria-hidden /> Invite someone</h2>
        <form action={createInvite} className="flex flex-wrap gap-2">
          <Input name="email" type="email" placeholder="name@tfgsolutions.com" required aria-label="Email" className="min-w-56 flex-1" />
          <select name="role" aria-label="Role" className={selectClass}>
            <option value="MEMBER">Member</option>
            <option value="LEADERSHIP">Leadership</option>
          </select>
          <Button type="submit"><Mail /> Send invite</Button>
        </form>
        <p className="mt-2 text-xs text-muted-foreground">Leadership automatically follows every to-do. Invites expire after 7 days.</p>
      </Paper>

      {invites.length > 0 && (
        <section className="mb-10">
          <SectionTitle>Pending invites</SectionTitle>
          <Paper className="divide-y">
            {invites.map((i) => (
              <div key={i.id} className="flex flex-col gap-1 px-5 py-3 text-sm">
                <div className="flex items-center gap-2">
                  <strong>{i.email}</strong>
                  <Badge variant="secondary">{i.role.toLowerCase()}</Badge>
                  <span className="ml-auto text-xs text-muted-foreground">sent {relative(i.createdAt)}</span>
                  <form action={revokeInvite}>
                    <input type="hidden" name="id" value={i.id} />
                    <Button type="submit" variant="ghost" size="xs" className="text-muted-foreground hover:text-destructive">Revoke</Button>
                  </form>
                </div>
                <code className="flex items-center gap-1.5 text-xs break-all text-muted-foreground">
                  <Link2 className="size-3.5 shrink-0" aria-hidden />{origin}/invite/{i.token}
                </code>
              </div>
            ))}
          </Paper>
        </section>
      )}

      <SectionTitle>Everyone</SectionTitle>
      <Paper className="divide-y">
        {members.map((m) => (
          <div key={m.userId} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
            <UserAvatar id={m.userId} name={m.user.name} size="lg" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{m.user.name}{m.userId === me.userId && <span className="font-normal text-muted-foreground"> (you)</span>}</p>
              <p className="truncate text-muted-foreground">{m.user.email}</p>
            </div>
            {m.role === "OWNER" ? (
              <Badge>Owner</Badge>
            ) : (
              <form action={setRole} className="flex items-center gap-2">
                <input type="hidden" name="userId" value={m.userId} />
                <select name="role" defaultValue={m.role} aria-label={`Role for ${m.user.name}`} className={selectClass}>
                  <option value="LEADERSHIP">Leadership</option>
                  <option value="MEMBER">Member</option>
                </select>
                <Button type="submit" variant="outline" size="sm">Save</Button>
              </form>
            )}
            {m.role !== "OWNER" && <PersonActions userId={m.userId} name={m.user.name} />}
          </div>
        ))}
      </Paper>
    </PageContainer>
  );
}

// Per-request auth + DB data; nothing to prerender.
export const instant = false;
