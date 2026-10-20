import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";

// Basecamp's signature layout: a white "sheet of paper" floating on a warm background.
export function Paper({ className, children, ...props }: React.ComponentProps<"div">) {
  return (
    <div className={cn("rounded-2xl border bg-card text-card-foreground shadow-paper", className)} {...props}>
      {children}
    </div>
  );
}

export function PageContainer({ className, children, size = "default" }: { className?: string; children: ReactNode; size?: "narrow" | "default" | "wide" }) {
  const width = { narrow: "max-w-2xl", default: "max-w-4xl", wide: "max-w-6xl" }[size];
  return <main className={cn("mx-auto w-full px-4 pt-6 pb-16 sm:pt-8", width, className)}>{children}</main>;
}

// The little pill above a sheet that points back to where you came from.
export function Breadcrumb({ href, children, color }: { href: string; children: ReactNode; color?: string }) {
  return (
    <div className="mb-4 flex justify-center">
      <Link
        href={href}
        className="inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1 text-sm font-medium text-muted-foreground shadow-xs transition-colors hover:text-foreground"
      >
        <ChevronLeft className="size-4" aria-hidden />
        {color && <span className="size-2.5 rounded-full" style={{ background: color }} aria-hidden />}
        {children}
      </Link>
    </div>
  );
}

export function PageHeader({ title, subtitle, actions, className }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <header className={cn("mb-8 flex flex-col items-center gap-2 text-center", className)}>
      <h1 className="text-3xl font-extrabold sm:text-4xl">{title}</h1>
      {subtitle && <p className="max-w-prose text-muted-foreground">{subtitle}</p>}
      {actions && <div className="mt-2 flex flex-wrap items-center justify-center gap-2">{actions}</div>}
    </header>
  );
}

export function EmptyState({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed px-6 py-12 text-center">
      {icon && <div className="text-muted-foreground [&_svg]:size-8">{icon}</div>}
      <p className="font-semibold">{title}</p>
      {children && <div className="text-sm text-muted-foreground">{children}</div>}
    </div>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center gap-3">
      <h2 className="text-lg font-bold">{children}</h2>
      <div className="h-px flex-1 bg-border" aria-hidden />
      {action}
    </div>
  );
}
