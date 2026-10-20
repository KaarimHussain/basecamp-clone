import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import type { Role } from "@/app/generated/prisma/client";

const RANK: Record<Role, number> = { MEMBER: 0, LEADERSHIP: 1, OWNER: 2 };

// ponytail: single workspace in v1; take a workspace slug here when multi-tenant lands.
export async function requireMember(minRole: Role = "MEMBER") {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const member = await prisma.member.findFirst({
    where: { userId: session.user.id },
    include: { workspace: true, user: true },
  });
  if (!member) redirect("/login");
  if (RANK[member.role] < RANK[minRole]) throw new Error("Forbidden");
  return member;
}
