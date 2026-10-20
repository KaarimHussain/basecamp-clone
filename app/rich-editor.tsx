"use client";

import { useState } from "react";
import { EditorContent, useEditor, useEditorState, type JSONContent } from "@tiptap/react";
import { Placeholder } from "@tiptap/extensions";
import { AtSign, Bold, Italic, List, ListOrdered, Quote, Strikethrough } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MentionOptions } from "@tiptap/extension-mention";
import type { SuggestionProps } from "@tiptap/suggestion";
import { editorExtensions } from "@/lib/editor";

export type MentionUser = { id: string; label: string };

// Plain-DOM dropdown; Tiptap's mount() handles positioning.
function suggestion(users: MentionUser[]): MentionOptions["suggestion"] {
  return {
    items: ({ query }) => users.filter((u) => u.label.toLowerCase().includes(query.toLowerCase())).slice(0, 6),
    render: () => {
      let el: HTMLUListElement;
      let unmount: (() => void) | undefined;
      let active = 0;
      let props: SuggestionProps<MentionUser>;

      const draw = () => {
        el.replaceChildren(
          ...props.items.map((u: MentionUser, i: number) => {
            const li = document.createElement("li");
            li.textContent = u.label;
            li.setAttribute("role", "option");
            li.setAttribute("aria-selected", String(i === active));
            li.className = `cursor-pointer rounded-md px-2.5 py-1.5 ${i === active ? "bg-accent text-accent-foreground" : ""}`;
            li.onmousedown = (e) => { e.preventDefault(); props.command(u); };
            return li;
          }),
        );
        el.hidden = props.items.length === 0;
      };

      return {
        onStart: (p) => {
          props = p;
          active = 0;
          el = document.createElement("ul");
          el.setAttribute("role", "listbox");
          el.className = "z-50 min-w-44 rounded-lg border bg-popover p-1 text-sm text-popover-foreground shadow-lg";
          draw();
          unmount = p.mount(el);
        },
        onUpdate: (p) => { props = p; active = 0; draw(); },
        onKeyDown: ({ event }) => {
          const n = props.items.length;
          if (!n) return false;
          if (event.key === "ArrowDown") active = (active + 1) % n;
          else if (event.key === "ArrowUp") active = (active - 1 + n) % n;
          else if (event.key === "Enter") { props.command(props.items[active]); return true; }
          else return false;
          draw();
          return true;
        },
        onExit: () => unmount?.(),
      };
    },
  };
}

function ToolbarButton({ onClick, active, label, children }: { onClick: () => void; active?: boolean; label: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()} // keep the editor's selection
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      title={label}
      className={cn("grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground [&_svg]:size-4", active && "bg-secondary text-foreground")}
    >
      {children}
    </button>
  );
}

// Writes the editor's JSON into a hidden input so plain <form action> works.
export default function RichEditor({ name, users, initial, placeholder }: {
  name: string;
  users: MentionUser[];
  initial?: JSONContent | null;
  placeholder?: string;
}) {
  const [json, setJson] = useState(() => JSON.stringify(initial ?? { type: "doc", content: [] }));
  const editor = useEditor({
    extensions: [...editorExtensions(suggestion(users)), Placeholder.configure({ placeholder: placeholder ?? "" })],
    content: initial ?? undefined,
    immediatelyRender: false, // SSR-safe
    editorProps: {
      attributes: {
        class: "min-h-24 px-3.5 py-2.5 text-[15px] leading-relaxed focus:outline-none",
        "aria-label": placeholder ?? name,
      },
    },
    onUpdate: ({ editor }) => setJson(JSON.stringify(editor.getJSON())),
  });
  // Re-render the toolbar's active states as the selection moves.
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e?.isActive("bold") ?? false,
      italic: e?.isActive("italic") ?? false,
      strike: e?.isActive("strike") ?? false,
      bullet: e?.isActive("bulletList") ?? false,
      ordered: e?.isActive("orderedList") ?? false,
      quote: e?.isActive("blockquote") ?? false,
    }),
  });
  const run = (fn: (c: ReturnType<NonNullable<typeof editor>["chain"]>) => { run: () => boolean }) => editor && fn(editor.chain().focus()).run();

  return (
    <div className="rich rounded-lg border border-input bg-card shadow-xs transition-shadow focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 dark:bg-input/30">
      <div role="toolbar" aria-label="Formatting" className="flex items-center gap-0.5 border-b px-1.5 py-1">
        <ToolbarButton label="Bold" active={state?.bold} onClick={() => run((c) => c.toggleBold())}><Bold /></ToolbarButton>
        <ToolbarButton label="Italic" active={state?.italic} onClick={() => run((c) => c.toggleItalic())}><Italic /></ToolbarButton>
        <ToolbarButton label="Strikethrough" active={state?.strike} onClick={() => run((c) => c.toggleStrike())}><Strikethrough /></ToolbarButton>
        <span className="mx-1 h-4 w-px bg-border" aria-hidden />
        <ToolbarButton label="Bulleted list" active={state?.bullet} onClick={() => run((c) => c.toggleBulletList())}><List /></ToolbarButton>
        <ToolbarButton label="Numbered list" active={state?.ordered} onClick={() => run((c) => c.toggleOrderedList())}><ListOrdered /></ToolbarButton>
        <ToolbarButton label="Quote" active={state?.quote} onClick={() => run((c) => c.toggleBlockquote())}><Quote /></ToolbarButton>
        <span className="mx-1 h-4 w-px bg-border" aria-hidden />
        <ToolbarButton label="Mention someone" onClick={() => run((c) => c.insertContent("@"))}><AtSign /></ToolbarButton>
      </div>
      <EditorContent editor={editor} />
      <input type="hidden" name={name} value={json} />
    </div>
  );
}
