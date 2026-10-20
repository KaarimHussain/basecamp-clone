"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { deleteMessage, editMessage, loadMessages, markRead, sendMessage } from "@/lib/chat";
import type { ChatMessage } from "@/lib/chat-data";
import Uploader from "@/app/uploader";
import { Hash, MessageSquareReply, Pencil, Send, Trash2, X } from "lucide-react";
import { useRealtime } from "../../realtime";
import { UserAvatar } from "@/components/user-avatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Consecutive messages from the same person within 5 minutes collapse under one avatar.
const continues = (prev: ChatMessage | undefined, m: ChatMessage) =>
  !!prev && prev.authorId === m.authorId && new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime() < 5 * 60_000;

const PAGE = 50;
const addUnique = (list: ChatMessage[], m: ChatMessage) => (list.some((x) => x.id === m.id) ? list : [...list, m]);

export default function ChatRoom({ channelId, title, meId, names, initial, thread }: {
  channelId: string;
  title: string;
  meId: string;
  names: Record<string, string>;
  initial: ChatMessage[];
  thread: { parent: ChatMessage; replies: ChatMessage[] } | null;
}) {
  const router = useRouter();
  const { socket } = useRealtime();
  const [messages, setMessages] = useState(initial);
  const [hasOlder, setHasOlder] = useState(initial.length === PAGE);
  const [typing, setTyping] = useState<Record<string, number>>({});
  const endRef = useRef<HTMLLIElement>(null);
  const stickToBottom = useRef(true);

  useEffect(() => {
    markRead(channelId);
  }, [channelId]);

  // Join this channel's room so typing indicators only go to people looking at it.
  useEffect(() => {
    if (!socket) return;
    const join = () =>
      fetch(`/api/realtime/token?channel=${channelId}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => d && socket.emit("join", d.token));
    join();
    socket.on("connect", join); // rejoin after reconnects
    return () => {
      socket.off("connect", join);
    };
  }, [socket, channelId]);

  useEffect(() => {
    if (stickToBottom.current) endRef.current?.scrollIntoView({ block: "end" });
    stickToBottom.current = true;
  }, [messages]);

  useEffect(() => {
    if (!socket) return;
    const onMessage = (m: ChatMessage) => {
      if (m.channelId !== channelId) return router.refresh(); // other channel: refresh sidebar badges
      if (m.parentId) {
        setMessages((list) => list.map((x) => (x.id === m.parentId ? { ...x, replyCount: x.replyCount + 1 } : x)));
        return;
      }
      setMessages((list) => addUnique(list, m));
      if (m.authorId !== meId) markRead(channelId);
    };
    const onTyping = ({ channelId: c, uid }: { channelId: string; uid: string }) => {
      if (c === channelId && uid !== meId) setTyping((t) => ({ ...t, [uid]: Date.now() + 3000 }));
    };
    const onUpdated = (e: { id: string; text: string }) => setMessages((list) => list.map((x) => (x.id === e.id ? { ...x, text: e.text } : x)));
    const onDeleted = (e: { id: string; parentId: string | null }) =>
      setMessages((list) =>
        e.parentId
          ? list.map((x) => (x.id === e.parentId ? { ...x, replyCount: Math.max(0, x.replyCount - 1) } : x))
          : list.filter((x) => x.id !== e.id),
      );
    socket.on("message:new", onMessage);
    socket.on("typing", onTyping);
    socket.on("message:updated", onUpdated);
    socket.on("message:deleted", onDeleted);
    return () => {
      socket.off("message:new", onMessage);
      socket.off("typing", onTyping);
      socket.off("message:updated", onUpdated);
      socket.off("message:deleted", onDeleted);
    };
  }, [socket, channelId, meId, router]);

  // Expire typing indicators.
  useEffect(() => {
    if (Object.keys(typing).length === 0) return;
    const t = setTimeout(() => setTyping((cur) => Object.fromEntries(Object.entries(cur).filter(([, until]) => until > Date.now()))), 1000);
    return () => clearTimeout(t);
  }, [typing]);

  async function older() {
    const page = await loadMessages(channelId, { before: messages[0]?.id });
    stickToBottom.current = false;
    setMessages((list) => [...page, ...list]);
    setHasOlder(page.length === PAGE);
  }

  const typers = Object.keys(typing).map((uid) => names[uid] ?? "Someone");

  return (
    <div className="flex h-[calc(100dvh-5.5rem)] min-h-96">
      <div className="flex min-w-0 flex-1 flex-col">
        <h1 className="flex items-center gap-2 border-b px-5 py-3.5 text-lg font-bold">
          {title.startsWith("# ") ? <><Hash className="size-5 text-muted-foreground" aria-hidden />{title.slice(2)}</> : title}
        </h1>
        <ol className="flex-1 overflow-y-auto px-3 py-4" aria-live="polite">
          {hasOlder && (
            <li className="mb-3 text-center">
              <Button variant="outline" size="sm" onClick={older}>Load older messages</Button>
            </li>
          )}
          {messages.length === 0 && (
            <li className="flex h-full flex-col items-center justify-center gap-1 text-center text-muted-foreground">
              <span className="text-4xl" aria-hidden>🔥</span>
              <p className="font-semibold text-foreground">The campfire is lit</p>
              <p className="text-sm">No messages yet. Say hi!</p>
            </li>
          )}
          {messages.map((m, i) => (
            <li key={m.id} className="group relative rounded-lg px-2 py-0.5 hover:bg-secondary/50">
              <Message m={m} compact={continues(messages[i - 1], m)} mine={m.authorId === meId} />
              {/* On my own messages the hover Reply sits left of the edit/delete buttons. */}
              <div className={cn("pl-12", m.replyCount === 0 && "absolute top-1 hidden pl-0 group-focus-within:block group-hover:block", m.replyCount === 0 && (m.authorId === meId ? "right-[4.75rem]" : "right-2"))}>
                <Link
                  href={`?thread=${m.id}`}
                  scroll={false}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-md text-xs font-medium",
                    m.replyCount > 0 ? "mt-1 mb-1 text-primary hover:underline" : "border bg-card px-2 py-1 text-muted-foreground shadow-xs hover:text-foreground",
                  )}
                >
                  <MessageSquareReply className="size-3.5" aria-hidden />
                  {m.replyCount > 0 ? `${m.replyCount} repl${m.replyCount === 1 ? "y" : "ies"}` : "Reply"}
                </Link>
              </div>
            </li>
          ))}
          <li ref={endRef} aria-hidden />
        </ol>
        <p className="h-5 px-5 text-xs text-muted-foreground italic">{typers.length > 0 && `${typers.join(", ")} ${typers.length > 1 ? "are" : "is"} typing…`}</p>
        <Composer channelId={channelId} onSent={(m) => setMessages((list) => addUnique(list, m))} placeholder={`Message ${title.replace("# ", "#")}`} />
      </div>
      {thread && <Thread key={thread.parent.id} channelId={channelId} meId={meId} {...thread} />}
    </div>
  );
}

function Thread({ channelId, meId, parent, replies: initial }: { channelId: string; meId: string; parent: ChatMessage; replies: ChatMessage[] }) {
  const { socket } = useRealtime();
  const [replies, setReplies] = useState(initial);

  useEffect(() => {
    if (!socket) return;
    const onMessage = (m: ChatMessage) => {
      if (m.parentId === parent.id) setReplies((list) => addUnique(list, m));
    };
    const onUpdated = (e: { id: string; text: string }) => setReplies((list) => list.map((x) => (x.id === e.id ? { ...x, text: e.text } : x)));
    const onDeleted = (e: { id: string }) => setReplies((list) => list.filter((x) => x.id !== e.id));
    socket.on("message:new", onMessage);
    socket.on("message:updated", onUpdated);
    socket.on("message:deleted", onDeleted);
    return () => {
      socket.off("message:new", onMessage);
      socket.off("message:updated", onUpdated);
      socket.off("message:deleted", onDeleted);
    };
  }, [socket, parent.id]);

  return (
    <aside aria-label="Thread" className="fixed inset-0 z-40 flex flex-col bg-card md:static md:z-auto md:w-96 md:border-l">
      <header className="flex items-center justify-between border-b px-4 py-3.5">
        <h2 className="font-bold">Thread</h2>
        <Link href="?" scroll={false} aria-label="Close thread" className="grid size-8 place-items-center rounded-md hover:bg-secondary"><X className="size-4" /></Link>
      </header>
      <ol className="flex-1 overflow-y-auto px-3 py-4">
        <li className="group mb-3 border-b px-2 pb-3"><Message m={parent} mine={parent.authorId === meId} /></li>
        {replies.length > 0 && <li className="mb-2 px-2 text-xs font-semibold text-muted-foreground">{replies.length} repl{replies.length === 1 ? "y" : "ies"}</li>}
        {replies.map((m, i) => <li key={m.id} className="group relative rounded-lg px-2 py-0.5 hover:bg-secondary/50"><Message m={m} compact={continues(replies[i - 1], m)} mine={m.authorId === meId} /></li>)}
      </ol>
      <Composer channelId={channelId} parentId={parent.id} onSent={(m) => setReplies((list) => addUnique(list, m))} placeholder="Reply…" />
    </aside>
  );
}

function Message({ m, compact, mine }: { m: ChatMessage; compact?: boolean; mine?: boolean }) {
  const time = new Date(m.createdAt);
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  return (
    <article className={cn("flex gap-3 text-[15px]", !compact && "mt-2")}>
      <div className="w-9 shrink-0">
        {compact ? (
          <time dateTime={m.createdAt} suppressHydrationWarning className="hidden pt-1 text-[10px] text-muted-foreground group-hover:block">
            {time.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
          </time>
        ) : (
          <UserAvatar id={m.authorId} name={m.authorName} />
        )}
      </div>
      <div className="min-w-0 flex-1">
        {!compact && (
          <div className="flex items-baseline gap-2">
            <strong className="text-sm">{m.authorName}</strong>
            <time dateTime={m.createdAt} suppressHydrationWarning className="text-xs text-muted-foreground">
              {time.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
            </time>
          </div>
        )}
        {editing ? (
          <form
            action={async (fd) => {
              await editMessage(m.id, String(fd.get("text") ?? ""));
              setEditing(false);
            }}
            className="my-1 flex flex-col gap-1.5"
          >
            <textarea
              name="text"
              defaultValue={m.text}
              required
              maxLength={4000}
              rows={2}
              autoFocus
              aria-label="Edit message"
              onKeyDown={(e) => e.key === "Escape" && setEditing(false)}
              className="w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-[15px] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
            <div className="flex gap-1.5">
              <Button type="submit" size="xs">Save</Button>
              <Button type="button" size="xs" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
            </div>
          </form>
        ) : (
          m.text && <p className="leading-relaxed break-words whitespace-pre-wrap">{m.text}</p>
        )}
        {confirming && (
          <div className="my-1 flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">Delete this message{m.replyCount > 0 && " and its replies"}?</span>
            <Button size="xs" variant="destructive" onClick={() => deleteMessage(m.id)}>Delete</Button>
            <Button size="xs" variant="ghost" onClick={() => setConfirming(false)}>Cancel</Button>
          </div>
        )}
        {m.attachments.length > 0 && (
          <ul className="mt-1.5 flex flex-wrap gap-2">
            {m.attachments.map((f) => (
              <li key={f.id}>
                <a href={`/api/attachments/${f.id}`} target="_blank" rel="noopener" className="block overflow-hidden rounded-lg border bg-card text-sm shadow-xs transition hover:shadow-md">
                  {f.mime.startsWith("image/") ? (
                    // eslint-disable-next-line @next/next/no-img-element -- auth-checked file route
                    <img src={`/api/attachments/${f.id}`} alt={f.name} className="max-h-48 min-h-16 max-w-72 min-w-16 bg-muted object-cover" />
                  ) : (
                    <span className="flex items-center gap-2 px-3 py-2 font-medium">📎 {f.name}</span>
                  )}
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
      {mine && !editing && (
        <div className="hidden shrink-0 items-start gap-0.5 group-focus-within:flex group-hover:flex">
          <button onClick={() => setEditing(true)} aria-label="Edit message" className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-card hover:text-foreground"><Pencil className="size-3.5" /></button>
          <button onClick={() => setConfirming(true)} aria-label="Delete message" className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-card hover:text-destructive"><Trash2 className="size-3.5" /></button>
        </div>
      )}
    </article>
  );
}

function Composer({ channelId, parentId, onSent, placeholder }: {
  channelId: string;
  parentId?: string;
  onSent: (m: ChatMessage) => void;
  placeholder: string;
}) {
  const { socket } = useRealtime();
  const [key, setKey] = useState(0); // remount clears text + uploads
  const lastTyping = useRef(0);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      key={key}
      ref={formRef}
      action={async (form) => {
        const m = await sendMessage(form);
        if (m) onSent(m);
        setKey((k) => k + 1);
      }}
      className="flex flex-col gap-1.5 border-t bg-card p-3"
    >
      <input type="hidden" name="channelId" value={channelId} />
      {parentId && <input type="hidden" name="parentId" value={parentId} />}
      <textarea
        name="text"
        rows={2}
        maxLength={4000}
        placeholder={placeholder}
        aria-label={placeholder}
        autoFocus
        className="w-full resize-none rounded-xl border border-input bg-background px-3.5 py-2.5 text-[15px] shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        onChange={() => {
          if (Date.now() - lastTyping.current > 2000) {
            lastTyping.current = Date.now();
            socket?.emit("typing", channelId);
          }
        }}
        onKeyDown={(e) => {
          // Enter sends, Shift+Enter adds a line.
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            formRef.current?.requestSubmit();
          }
        }}
      />
      <div className="flex items-center justify-between">
        <Uploader />
        <Button type="submit" size="sm"><Send /> Send</Button>
      </div>
    </form>
  );
}
