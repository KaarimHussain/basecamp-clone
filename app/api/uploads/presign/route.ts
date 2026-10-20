import { randomUUID } from "node:crypto";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { MAX_UPLOAD_BYTES, presignPut } from "@/lib/r2";

const body = z.object({
  name: z.string().min(1).max(200),
  mime: z.string().max(100).default("application/octet-stream"),
  size: z.number().int().positive().max(MAX_UPLOAD_BYTES),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const member = await prisma.member.findFirst({ where: { userId: session.user.id } });
  if (!member) return Response.json({ error: "Forbidden" }, { status: 403 });

  const parsed = body.safeParse(await req.json());
  if (!parsed.success) return Response.json({ error: "Files must be 25 MB or smaller." }, { status: 400 });
  const { name, mime, size } = parsed.data;

  const key = `${member.workspaceId}/${randomUUID()}/${name.replace(/[^\w.-]+/g, "_")}`;
  return Response.json({ key, url: await presignPut(key, mime || "application/octet-stream", size) });
}
