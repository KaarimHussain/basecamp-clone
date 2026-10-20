import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireMember } from "@/lib/session";
import { logout } from "@/lib/actions";
import RealtimeProvider from "./realtime";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const me = await requireMember();
  const unread = await prisma.notification.count({ where: { userId: me.userId, readAt: null } });

  return (
    <RealtimeProvider>
      <header className="border-b">
        <nav className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3 text-sm">
          <Link href="/" className="mr-auto font-semibold">{me.workspace.name}</Link>
          <Link href="/chat" className="underline">Chat</Link>
          <Link href="/inbox" className="underline">
            Inbox{unread > 0 && <span className="ml-1 rounded-full bg-red-600 px-1.5 text-xs text-white">{unread}</span>}
          </Link>
          {me.role === "OWNER" && (
            <>
              <Link href="/categories" className="underline">Categories</Link>
              <Link href="/members" className="underline">Members</Link>
            </>
          )}
          <Link href="/account" className="text-zinc-500 hover:underline">{me.user.name} · {me.role.toLowerCase()}</Link>
          <form action={logout}><button className="underline">Sign out</button></form>
        </nav>
      </header>
      {children}
    </RealtimeProvider>
  );
}

// Per-request auth + DB data; nothing to prerender.
export const instant = false;
