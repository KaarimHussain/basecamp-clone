import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { createToken } from "@/lib/realtime-token";

// Short-lived token the browser hands to the socket service.
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });
  const member = await prisma.member.findFirst({ where: { userId: session.user.id } });
  if (!member) return new Response("Forbidden", { status: 403 });
  return Response.json({ token: createToken({ uid: member.userId, ws: member.workspaceId }, process.env.REALTIME_SECRET!) });
}
