"use client";

import { startTransition, useActionState, useState } from "react";
import { Check, Copy, KeyRound, MoreHorizontal, UserMinus } from "lucide-react";
import { ownerResetLink, removeMember } from "@/lib/actions";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// Owner-only menu on each person: issue a reset link, or remove them.
export default function PersonActions({ userId, name }: { userId: string; name: string }) {
  const [link, makeLink, making] = useActionState(ownerResetLink, undefined);
  const [copied, setCopied] = useState(false);
  const [confirm, setConfirm] = useState(false);

  return (
    <div className="flex basis-full flex-col items-end gap-2 sm:basis-auto">
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`More for ${name}`} />}>
          <MoreHorizontal />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem
            disabled={making}
            onClick={() => {
              const fd = new FormData();
              fd.set("userId", userId);
              startTransition(() => makeLink(fd));
            }}
          >
            <KeyRound /> Create password reset link
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={() => setConfirm(true)}>
            <UserMinus /> Remove from workspace
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {link && (
        <div className="flex w-full max-w-md items-center gap-2 rounded-lg bg-accent px-3 py-2 text-xs text-accent-foreground">
          <code className="min-w-0 flex-1 truncate" title={link}>{link}</code>
          <Button
            type="button"
            size="xs"
            variant="outline"
            onClick={() => navigator.clipboard.writeText(link).then(() => setCopied(true))}
          >
            {copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy"}
          </Button>
        </div>
      )}
      {link && <p className="text-xs text-muted-foreground">Send this to {name}. It works once and expires in 1 hour.</p>}

      {confirm && (
        <form action={removeMember} className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs">
          <input type="hidden" name="userId" value={userId} />
          <span>Remove {name}? Their comments and messages stay.</span>
          <Button type="submit" size="xs" variant="destructive">Remove</Button>
          <Button type="button" size="xs" variant="ghost" onClick={() => setConfirm(false)}>Cancel</Button>
        </form>
      )}
    </div>
  );
}
