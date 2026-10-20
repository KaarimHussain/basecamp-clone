import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

// Basecamp-style coloured initials, stable per person.
const HUES = [152, 28, 250, 330, 200, 90, 290, 12];

export function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("") || "?";
}

function hue(seed: string) {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return HUES[h % HUES.length];
}

export function UserAvatar({ id, name, size = "default", className }: {
  id: string;
  name: string;
  size?: "sm" | "default" | "lg";
  className?: string;
}) {
  const h = hue(id);
  return (
    <Avatar size={size} className={className} title={name}>
      <AvatarFallback
        className="font-semibold text-white"
        style={{ background: `oklch(0.62 0.13 ${h})` }}
      >
        {initials(name)}
      </AvatarFallback>
    </Avatar>
  );
}

// Overlapping row of avatars ("+3" when there are more).
export function AvatarStack({ people, max = 4, size = "sm" }: {
  people: { id: string; name: string }[];
  max?: number;
  size?: "sm" | "default";
}) {
  const shown = people.slice(0, max);
  const extra = people.length - shown.length;
  return (
    <div className="flex -space-x-1.5">
      {shown.map((p) => (
        <UserAvatar key={p.id} id={p.id} name={p.name} size={size} className="ring-2 ring-card" />
      ))}
      {extra > 0 && (
        <span className={cn("grid place-items-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground ring-2 ring-card", size === "sm" ? "size-6" : "size-8")}>
          +{extra}
        </span>
      )}
    </div>
  );
}
