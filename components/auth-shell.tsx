import type { ReactNode } from "react";

// Centered card on the warm background for sign-in / invite screens.
export function AuthShell({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children: ReactNode }) {
  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden px-4 py-12">
      {/* soft sunny glow behind the card */}
      <div aria-hidden className="pointer-events-none absolute -top-40 left-1/2 size-[36rem] -translate-x-1/2 rounded-full bg-highlight/25 blur-3xl" />
      <div className="relative w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <span className="grid size-14 place-items-center rounded-2xl bg-highlight text-lg font-black text-black shadow-paper">TFG</span>
          <h1 className="text-3xl font-extrabold">{title}</h1>
          {subtitle && <p className="text-muted-foreground">{subtitle}</p>}
        </div>
        <div className="rounded-2xl border bg-card p-6 shadow-paper">{children}</div>
        <p className="mt-6 text-center text-xs text-muted-foreground">TFG Workspace · built for the TFG Solutions publishing team</p>
      </div>
    </main>
  );
}
