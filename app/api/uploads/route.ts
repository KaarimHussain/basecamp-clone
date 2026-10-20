import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { MAX_UPLOAD_BYTES, saveFile } from "@/lib/storage";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const member = await prisma.member.findFirst({ where: { userId: session.user.id } });
  if (!member) return Response.json({ error: "Forbidden" }, { status: 403 });

  // Reject before buffering the body when the client declares an oversized upload.
  if (Number(req.headers.get("content-length")) > MAX_UPLOAD_BYTES + 64 * 1024) {
    return Response.json({ error: "Files must be 25 MB or smaller." }, { status: 413 });
  }
  const file = (await req.formData()).get("file");
  if (!(file instanceof File) || file.size === 0) return Response.json({ error: "No file" }, { status: 400 });
  if (file.size > MAX_UPLOAD_BYTES) return Response.json({ error: "Files must be 25 MB or smaller." }, { status: 413 });

  const key = await saveFile(member.workspaceId, file);
  return Response.json({ key, name: file.name.slice(0, 200), mime: (file.type || "application/octet-stream").slice(0, 100), size: file.size });
}
