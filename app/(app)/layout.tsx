import { prisma } from "@/lib/db";
import { requireMember } from "@/lib/session";
import { unreadByChannel } from "@/lib/chat-unread";
import RealtimeProvider from "./realtime";
import AppNav from "./app-nav";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const me = await requireMember();
  const [unread, chat] = await Promise.all([
    prisma.notification.count({ where: { userId: me.userId, readAt: null } }),
    unreadByChannel(me),
  ]);
  const chatUnread = [...chat.values()].reduce((a, b) => a + b, 0);

  return (
    <RealtimeProvider meId={me.userId}>
      <AppNav
        me={{ id: me.userId, name: me.user.name, email: me.user.email, role: me.role }}
        unread={unread}
        chatUnread={chatUnread}
        workspace={me.workspace.name}
      />
      {children}
    </RealtimeProvider>
  );
}

// Per-request auth + DB data; nothing to prerender.
export const instant = false;
