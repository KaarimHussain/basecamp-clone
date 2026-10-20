import "server-only";
import { generateHTML } from "@tiptap/html";
import { z } from "zod";
import { editorExtensions } from "@/lib/editor";

const extensions = editorExtensions();

type Node = { type?: string; attrs?: { id?: string }; content?: Node[] };

// Parses a form field holding Tiptap JSON. Throws on anything the schema can't render.
export const richText = z
  .string()
  .max(100_000)
  .transform((s, ctx) => {
    try {
      const doc = JSON.parse(s) as Node;
      if (doc?.type !== "doc") throw new Error();
      generateHTML(doc, extensions);
      return doc;
    } catch {
      ctx.addIssue({ code: "custom", message: "Invalid rich text" });
      return z.NEVER;
    }
  });

export function isEmpty(doc: Node): boolean {
  if (doc.type === "mention" || (doc.type === "text" && (doc as { text?: string }).text?.trim())) return false;
  return (doc.content ?? []).every(isEmpty);
}

export function renderRichText(doc: unknown) {
  return doc ? generateHTML(doc as Node, extensions) : "";
}

export function mentionIds(doc: Node): string[] {
  const ids = new Set<string>();
  const walk = (n: Node) => {
    if (n.type === "mention" && n.attrs?.id) ids.add(n.attrs.id);
    n.content?.forEach(walk);
  };
  walk(doc);
  return [...ids];
}
