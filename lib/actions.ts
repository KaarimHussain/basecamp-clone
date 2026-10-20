"use server";

import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { AuthError } from "next-auth";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { signIn, signOut } from "@/auth";
import { prisma } from "@/lib/db";
import { requireMember } from "@/lib/session";
import { backfill, removeLeadershipFollows } from "@/lib/leadership";

export async function login(_: string | undefined, form: FormData) {
  try {
    await signIn("credentials", { email: form.get("email"), password: form.get("password"), redirectTo: "/" });
  } catch (e) {
    if (e instanceof AuthError) return "Invalid email or password.";
    throw e; // successful sign-in throws a redirect
  }
}

export async function logout() {
  await signOut({ redirectTo: "/login" });
}

const inviteSchema = z.object({
  email: z.email().transform((s) => s.toLowerCase()),
  role: z.enum(["LEADERSHIP", "MEMBER"]),
});

export async function createInvite(form: FormData) {
  const me = await requireMember("OWNER");
  const { email, role } = inviteSchema.parse(Object.fromEntries(form));
  await prisma.invite.create({
    data: {
      workspaceId: me.workspaceId,
      email,
      role,
      token: randomBytes(24).toString("base64url"),
      invitedById: me.userId,
      expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
    },
  });
  revalidatePath("/members");
}

export async function setRole(form: FormData) {
  const me = await requireMember("OWNER");
  const userId = z.string().parse(form.get("userId"));
  const role = z.enum(["LEADERSHIP", "MEMBER"]).parse(form.get("role"));
  if (userId === me.userId) throw new Error("Cannot change your own role");
  await prisma.$transaction(async (tx) => {
    await tx.member.update({
      where: { workspaceId_userId: { workspaceId: me.workspaceId, userId } },
      data: { role },
    });
    // Promotion follows every open task; demotion removes only the LEADERSHIP-reason follows.
    if (role === "LEADERSHIP") await backfill(tx, userId, { workspaceId: me.workspaceId });
    else await removeLeadershipFollows(tx, me.workspaceId, userId, {});
  });
  revalidatePath("/members");
}

// Replaces a category's watchers. New watchers follow its open tasks; removed ones drop those follows.
export async function setWatchers(form: FormData) {
  const me = await requireMember("OWNER");
  const categoryId = z.string().parse(form.get("categoryId"));
  const category = await prisma.category.findFirst({ where: { id: categoryId, workspaceId: me.workspaceId } });
  if (!category) throw new Error("Category not found");

  const wanted = new Set(
    (await prisma.member.findMany({
      where: { workspaceId: me.workspaceId, userId: { in: form.getAll("userIds").map(String) } },
      select: { userId: true },
    })).map((m) => m.userId),
  );
  const current = new Set((await prisma.categoryWatcher.findMany({ where: { categoryId } })).map((w) => w.userId));
  const added = [...wanted].filter((id) => !current.has(id));
  const removed = [...current].filter((id) => !wanted.has(id));

  await prisma.$transaction(async (tx) => {
    await tx.categoryWatcher.createMany({ data: added.map((userId) => ({ categoryId, userId })) });
    await tx.categoryWatcher.deleteMany({ where: { categoryId, userId: { in: removed } } });
    for (const userId of added) await backfill(tx, userId, { categoryId });
    for (const userId of removed) await removeLeadershipFollows(tx, me.workspaceId, userId, { categoryId });
  });
  revalidatePath("/categories");
}

const acceptSchema = z.object({
  token: z.string(),
  name: z.string().trim().min(1).max(80),
  password: z.string().min(8, "Password must be at least 8 characters."),
});

export async function acceptInvite(_: string | undefined, form: FormData) {
  const parsed = acceptSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return parsed.error.issues[0].message;
  const { token, name, password } = parsed.data;

  const invite = await prisma.invite.findUnique({ where: { token } });
  if (!invite || invite.acceptedAt || invite.expiresAt < new Date()) return "This invite is invalid or expired.";
  if (await prisma.user.findUnique({ where: { email: invite.email } })) return "An account with this email already exists.";

  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.$transaction([
    prisma.user.create({
      data: {
        email: invite.email,
        name,
        passwordHash,
        memberships: { create: { workspaceId: invite.workspaceId, role: invite.role } },
      },
    }),
    prisma.invite.update({ where: { id: invite.id }, data: { acceptedAt: new Date() } }),
  ]);

  await signIn("credentials", { email: invite.email, password, redirectTo: "/" });
}
