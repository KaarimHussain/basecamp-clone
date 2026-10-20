import { prisma } from "@/lib/db";
import { requireMember } from "@/lib/session";
import RealtimeProvider from "./realtime";
import AppNav from "./app-nav";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const me = await requireMember();
  const unread = await prisma.notification.count({ where: { userId: me.userId, readAt: null } });

  return (
    <RealtimeProvider>
      <AppNav
        me={{ id: me.userId, name: me.user.name, email: me.user.email, role: me.role }}
        unread={unread}
        workspace={me.workspace.name}
      />
      {children}
    </RealtimeProvider>
  );
}

// Per-request auth + DB data; nothing to prerender.
export const instant = false;
