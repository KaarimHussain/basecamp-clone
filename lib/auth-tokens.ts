import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import type { AuthTokenKind } from "@/app/generated/prisma/client";

const TTL_MIN: Record<AuthTokenKind, number> = { RESET: 60, MAGIC: 15 };
const hash = (raw: string) => createHash("sha256").update(raw).digest("hex");

// Returns the raw token for the link; only its hash is stored.
export async function issueToken(userId: string, kind: AuthTokenKind) {
  const raw = randomBytes(32).toString("base64url");
  await prisma.authToken.create({
    data: { userId, kind, tokenHash: hash(raw), expiresAt: new Date(Date.now() + TTL_MIN[kind] * 60_000) },
  });
  return raw;
}

// Valid, unused, unexpired token → its user (without consuming it).
export async function peekToken(raw: string, kind: AuthTokenKind) {
  const t = await prisma.authToken.findUnique({ where: { tokenHash: hash(raw) }, include: { user: true } });
  return t && t.kind === kind && !t.usedAt && t.expiresAt > new Date() ? t.user : null;
}

// Single use: the conditional update means two concurrent clicks can't both succeed.
export async function consumeToken(raw: string, kind: AuthTokenKind) {
  const t = await prisma.authToken.findUnique({ where: { tokenHash: hash(raw) } });
  if (!t || t.kind !== kind) return null;
  const { count } = await prisma.authToken.updateMany({
    where: { id: t.id, usedAt: null, expiresAt: { gt: new Date() } },
    data: { usedAt: new Date() },
  });
  return count === 1 ? t.userId : null;
}
