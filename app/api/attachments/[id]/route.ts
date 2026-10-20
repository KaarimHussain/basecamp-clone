import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { presignGet } from "@/lib/r2";

// Checks access, then hands the browser a short-lived R2 URL.
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

  return Response.redirect(await presignGet(file.key, file.name), 302);
}
