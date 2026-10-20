"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { Home, MessagesSquare, Bell, CheckSquare, Shapes, Users, Menu, Moon, Sun, Monitor, LogOut, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { UserAvatar } from "@/components/user-avatar";
import { logout } from "@/lib/actions";
import { cn } from "@/lib/utils";

type Props = { me: { id: string; name: string; email: string; role: string }; unread: number; workspace: string };

function links(isOwner: boolean, unread: number) {
  return [
    { href: "/", label: "Home", icon: Home, exact: true },
    { href: "/chat", label: "Chat", icon: MessagesSquare },
    { href: "/inbox", label: "Hey!", icon: Bell, badge: unread },
    { href: "/me", label: "My Stuff", icon: CheckSquare },
    ...(isOwner
      ? [
          { href: "/categories", label: "Categories", icon: Shapes },
          { href: "/members", label: "People", icon: Users },
        ]
      : []),
  ];
}

export default function AppNav({ me, unread, workspace }: Props) {
  const path = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const items = links(me.role === "OWNER", unread);
  const active = (href: string, exact?: boolean) =>
    exact ? path === href : path === href || path.startsWith(`${href}/`) || (href === "/" && (path.startsWith("/c/") || path.startsWith("/t/")));

  const navLinks = (onNavigate?: () => void) =>
    items.map(({ href, label, icon: Icon, badge, exact }) => (
      <Link
        key={href}
        href={href}
        onClick={onNavigate}
        aria-current={active(href, exact) ? "page" : undefined}
        className={cn(
          "relative inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground",
          active(href, exact) && "bg-secondary text-foreground",
        )}
      >
        <Icon className="size-4" aria-hidden />
        {label}
        {!!badge && (
          <span className="ml-0.5 rounded-full bg-highlight px-1.5 text-[11px] font-bold leading-5 text-black" aria-label={`${badge} unread`}>
            {badge > 99 ? "99+" : badge}
          </span>
        )}
      </Link>
    ));

  return (
    <header className="sticky top-0 z-30 border-b bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-3 px-4">
        <Link href="/" className="flex items-center gap-2 font-bold">
          <span className="grid size-8 place-items-center rounded-lg bg-highlight text-sm font-black text-black shadow-sm">TFG</span>
          <span className="hidden sm:inline">{workspace}</span>
        </Link>

        <nav aria-label="Main" className="mx-auto hidden items-center gap-1 md:flex">{navLinks()}</nav>

        <div className="ml-auto flex items-center gap-1 md:ml-0">
          <UserMenu me={me} />
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger render={<Button variant="ghost" size="icon" className="md:hidden" aria-label="Open menu" />}>
              <Menu />
            </SheetTrigger>
            <SheetContent side="right" className="w-72">
              <SheetHeader>
                <SheetTitle>{workspace}</SheetTitle>
              </SheetHeader>
              <nav aria-label="Main" className="flex flex-col gap-1 px-4">{navLinks(() => setMenuOpen(false))}</nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}

function UserMenu({ me }: { me: Props["me"] }) {
  const { theme, setTheme } = useTheme();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="rounded-full" aria-label="Your account" />}>
        <UserAvatar id={me.id} name={me.name} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex flex-col">
            <span className="font-semibold text-foreground">{me.name}</span>
            <span className="text-xs font-normal text-muted-foreground">{me.email} · {me.role.toLowerCase()}</span>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link href="/account" />}>
          <UserRound /> Profile &amp; password
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>Theme</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={theme ?? "system"} onValueChange={(v) => setTheme(String(v))}>
            <DropdownMenuRadioItem value="light"><Sun /> Light</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="dark"><Moon /> Dark</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="system"><Monitor /> System</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => logout()}>
          <LogOut /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
