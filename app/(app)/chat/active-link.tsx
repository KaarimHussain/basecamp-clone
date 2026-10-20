"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export default function ActiveLink({ href, children }: { href: string; children: ReactNode }) {
  const active = usePathname() === href;
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors ${active ? "bg-secondary font-semibold text-foreground" : "text-muted-foreground hover:bg-secondary/70 hover:text-foreground"}`}
    >
      {children}
    </Link>
  );
}
