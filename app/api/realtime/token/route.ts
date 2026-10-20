import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { createToken } from "@/lib/realtime-token";
import { channelFor } from "@/lib/chat-data";

// Short-lived token the browser hands to the socket service.
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });
  const member = await prisma.member.findFirst({ where: { userId: session.user.id } });
  if (!member) return new Response("Forbidden", { status: 403 });
  const channelId = new URL(req.url).searchParams.get("channel");
  if (channelId) {
    const channel = await channelFor(channelId, member).catch(() => null);
    if (!channel) return new Response("Forbidden", { status: 403 });
    return Response.json({ token: createToken({ uid: member.userId, ws: member.workspaceId, ch: channel.id }, process.env.REALTIME_SECRET!, 300) });
  }
  return Response.json({ token: createToken({ uid: member.userId, ws: member.workspaceId }, process.env.REALTIME_SECRET!) });
}
