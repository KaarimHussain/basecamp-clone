import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { filePath } from "@/lib/storage";

// Only images render inline; everything else downloads, so an uploaded HTML/SVG can't run in our origin.
const INLINE = /^image\/(png|jpe?g|gif|webp|avif)$/;

export async function GET(_: Request, { params }: RouteContext<"/api/attachments/[id]">) {
  const session = await auth();
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;

  const file = await prisma.attachment.findUnique({
    where: { id },
    include: { task: true, comment: { include: { task: true } } },
  });
  const workspaceId = file?.task?.workspaceId ?? file?.comment?.task.workspaceId;
  if (!file || !workspaceId) return new Response("Not found", { status: 404 });

  const member = await prisma.member.findUnique({ where: { workspaceId_userId: { workspaceId, userId: session.user.id } } });
  if (!member) return new Response("Not found", { status: 404 });

  const full = filePath(file.key);
  const info = await stat(full).catch(() => null);
  if (!info) return new Response("File missing", { status: 404 });

  const inline = INLINE.test(file.mime);
  return new Response(Readable.toWeb(createReadStream(full)) as ReadableStream, {
    headers: {
      "content-type": inline ? file.mime : "application/octet-stream",
      "content-length": String(info.size),
      "content-disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(file.name)}`,
      "x-content-type-options": "nosniff",
      "cache-control": "private, max-age=3600",
    },
  });
}
