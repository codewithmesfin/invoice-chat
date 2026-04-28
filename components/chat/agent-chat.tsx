"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  History,
  ImagePlus,
  Loader2,
  Paperclip,
  Plus,
  RotateCcw,
  Send,
  Sparkles,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  chatFriendlyError,
  friendlyUserMessage,
  parseJsonSafe,
  type ApiErrorBody,
} from "@/lib/http/api-user-message";
import { ChatSessionsDrawer, type ChatSessionRow } from "@/components/chat/chat-sessions-drawer";
import { extractInvoiceLinksFromMessageMetadata } from "@/lib/chat/invoice-links-from-steps";

type ChatRole = "user" | "assistant";

type UiMessage = {
  id: string;
  role: ChatRole;
  content: string;
  /** ISO from server `created_at`, or client clock for optimistic bubbles */
  createdAt?: string | null;
  invoiceLinks?: { id: string; number: string }[];
};

type PendingReceipt = {
  id: string;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  base64: string;
  previewUrl: string;
};

type ReceiptPayload = { mimeType: PendingReceipt["mimeType"]; base64: string };

type StepExecution = {
  stepId: string;
  action: string;
  status: "pending" | "running" | "done" | "error";
  output?: unknown;
  error?: string;
};

type Plan = {
  goal: string;
  steps: { id: string; action: string; input: Record<string, unknown> }[];
};

const SESSION_KEY = "invoicing_chat_session_id";
const CHAT_TIMEOUT_MS = 120_000;

const SUGGESTIONS = [
  "Who owes me money?",
  "Summarize my invoices",
  "Overdue invoices?",
  "Find a client",
  "Log $48 lunch expense today",
];

function isSameCalendarDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  );
}

/** Locale-aware label: Today / Yesterday / weekday date + time. */
function formatChatLogTimestamp(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;

  const now = new Date();
  const timeFmt = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });
  const timeStr = timeFmt.format(d);

  if (isSameCalendarDay(d, now)) {
    return `Today · ${timeStr}`;
  }

  const yday = new Date(now);
  yday.setDate(yday.getDate() - 1);
  if (isSameCalendarDay(d, yday)) {
    return `Yesterday · ${timeStr}`;
  }

  const dateStr = new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(d.getFullYear() !== now.getFullYear() ? { year: "numeric" as const } : {}),
  }).format(d);

  return `${dateStr} · ${timeStr}`;
}

export function AgentChat() {
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [threadLoading, setThreadLoading] = useState(false);
  const [sessionHeading, setSessionHeading] = useState("New chat");
  const [lastPlan, setLastPlan] = useState<Plan | null>(null);
  const [lastSteps, setLastSteps] = useState<StepExecution[] | null>(null);
  const [pendingReceipts, setPendingReceipts] = useState<PendingReceipt[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [sessions, setSessions] = useState<ChatSessionRow[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<ChatSessionRow | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [renameSaving, setRenameSaving] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastPayloadRef = useRef<{
    message: string;
    sessionId: string | undefined;
    receipts?: ReceiptPayload[];
  } | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const existing = sessionStorage.getItem(SESSION_KEY);
    if (existing) setSessionId(existing);
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading, lastSteps]);

  const loadThread = useCallback(async (sid: string) => {
    setThreadLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/chat/sessions/${sid}`);
      const raw = await parseJsonSafe(res);
      const body = raw as {
        session?: { title: string | null };
        messages?: Array<{ id: string; role: string; content: string; created_at?: string | null }>;
      } & ApiErrorBody;

      if (!res.ok) {
        if (res.status === 404) {
          sessionStorage.removeItem(SESSION_KEY);
          setSessionId(null);
          setMessages([]);
          setLastPlan(null);
          setLastSteps(null);
          setSessionHeading("New chat");
          setError(friendlyUserMessage(404, body, "That conversation is no longer available."));
          return;
        }
        setError(friendlyUserMessage(res.status, body, "Couldn’t load this conversation."));
        return;
      }

      const rows = body.messages ?? [];
      setMessages(
        rows
          .filter((m) => m.role === "user" || m.role === "assistant")
          .map((m) => {
            const role = m.role as ChatRole;
            const metadata = (m as { metadata?: unknown }).metadata;
            return {
              id: m.id,
              role,
              content: m.content,
              createdAt: (m as { created_at?: string | null }).created_at ?? null,
              invoiceLinks:
                role === "assistant" ? extractInvoiceLinksFromMessageMetadata(metadata) : undefined,
            };
          })
      );
      const t = (body.session?.title ?? "").trim();
      setSessionHeading(t || "Conversation");
      setLastPlan(null);
      setLastSteps(null);
    } catch {
      setError("We couldn’t load messages. Check your connection and try opening History again.");
    } finally {
      setThreadLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!sessionId) {
      setMessages([]);
      setLastPlan(null);
      setLastSteps(null);
      setSessionHeading("New chat");
      setThreadLoading(false);
      return;
    }
    void loadThread(sessionId);
  }, [sessionId, reloadToken, loadThread]);

  const fetchSessions = useCallback(async () => {
    setSessionsLoading(true);
    try {
      const res = await fetch("/api/chat/sessions");
      const raw = await parseJsonSafe(res);
      const body = raw as { sessions?: ChatSessionRow[] } & ApiErrorBody;
      if (!res.ok) {
        setSessions([]);
        return;
      }
      setSessions(body.sessions ?? []);
    } finally {
      setSessionsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (historyOpen) void fetchSessions();
  }, [historyOpen, fetchSessions]);

  const startNewChat = useCallback(() => {
    setHistoryOpen(false);
    setSessionId(null);
    sessionStorage.removeItem(SESSION_KEY);
    setMessages([]);
    setLastPlan(null);
    setLastSteps(null);
    setSessionHeading("New chat");
    setInput("");
    setError(null);
  }, []);

  const selectSession = useCallback((id: string) => {
    setHistoryOpen(false);
    setSessionId(id);
    sessionStorage.setItem(SESSION_KEY, id);
  }, []);

  function openRename(s: ChatSessionRow) {
    setRenameTarget(s);
    setRenameDraft((s.title ?? "").trim() || "Conversation");
    setRenameOpen(true);
  }

  async function submitRename() {
    if (!renameTarget) return;
    const title = renameDraft.trim();
    if (!title) return;
    setRenameSaving(true);
    try {
      const res = await fetch(`/api/chat/sessions/${renameTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      const raw = await parseJsonSafe(res);
      const body = raw as ApiErrorBody;
      if (!res.ok) {
        setError(friendlyUserMessage(res.status, body, "Couldn’t rename that chat."));
        return;
      }
      setRenameOpen(false);
      setRenameTarget(null);
      if (renameTarget.id === sessionId) {
        setSessionHeading(title);
      }
      void fetchSessions();
    } finally {
      setRenameSaving(false);
    }
  }

  async function deleteSession(id: string, title: string | null) {
    const label = (title ?? "this chat").trim() || "this chat";
    if (!confirm(`Delete “${label}”? This cannot be undone.`)) return;
    const res = await fetch(`/api/chat/sessions/${id}`, { method: "DELETE" });
    const raw = await parseJsonSafe(res);
    const body = raw as ApiErrorBody;
    if (!res.ok) {
      setError(friendlyUserMessage(res.status, body, "Couldn’t delete that chat."));
      return;
    }
    if (id === sessionId) {
      startNewChat();
    }
    void fetchSessions();
  }

  const postChat = useCallback(
    async (opts: {
      message: string;
      receipts?: ReceiptPayload[];
      showUserBubble: boolean;
      userBubbleText?: string;
    }) => {
      const { message, receipts, showUserBubble, userBubbleText } = opts;
      setError(null);
      if (showUserBubble) {
        setMessages((m) => [
          ...m,
          {
            id: `local-${crypto.randomUUID()}`,
            role: "user",
            content: userBubbleText ?? (message.trim() ? message : "[Attachment]"),
            createdAt: new Date().toISOString(),
          },
        ]);
      }

      setLoading(true);
      setLastPlan(null);
      setLastSteps(null);

      const previousSid = lastPayloadRef.current?.sessionId;
      const sid = showUserBubble
        ? sessionId ?? undefined
        : (sessionId ?? previousSid ?? undefined);
      lastPayloadRef.current = { message, sessionId: sid, receipts };

      const ctrl = new AbortController();
      const tid = window.setTimeout(() => ctrl.abort(), CHAT_TIMEOUT_MS);

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message,
            sessionId: sid,
            ...(receipts?.length ? { receipts } : {}),
          }),
          signal: ctrl.signal,
        });

        window.clearTimeout(tid);

        const raw = await parseJsonSafe(res);
        const data = (raw ?? {}) as {
          error?: string;
          hint?: string;
          message?: string;
          reply?: string;
          sessionId?: string;
          plan?: Plan;
          steps?: StepExecution[];
        };

        if (!res.ok) {
          setError(chatFriendlyError(res.status, data as ApiErrorBody));
          return;
        }

        if (data.sessionId) {
          setSessionId(data.sessionId);
          sessionStorage.setItem(SESSION_KEY, data.sessionId);
        }
        if (data.plan) setLastPlan(data.plan);
        if (data.steps) setLastSteps(data.steps);
        setPendingReceipts([]);
        setReloadToken((t) => t + 1);
      } catch (e) {
        window.clearTimeout(tid);
        if (e instanceof DOMException && e.name === "AbortError") {
          setError(
            "That took longer than two minutes. Try a shorter question, fewer receipt images, or tap Retry."
          );
          return;
        }
        setError("We couldn’t reach the server. Check your connection and tap Retry.");
      } finally {
        setLoading(false);
        textareaRef.current?.focus();
      }
    },
    [sessionId]
  );

  const send = useCallback(
    async (textOverride?: string) => {
      if (loading) return;
      const text = (textOverride ?? input).trim();
      const receiptsPayload =
        pendingReceipts.length > 0
          ? pendingReceipts.map((r) => ({ mimeType: r.mimeType, base64: r.base64 }))
          : undefined;
      if (!text && !receiptsPayload?.length) return;

      if (textOverride === undefined) setInput("");

      const display =
        text || (pendingReceipts.length ? `[${pendingReceipts.length} receipt image(s)]` : "");

      await postChat({
        message: text,
        receipts: receiptsPayload,
        showUserBubble: true,
        userBubbleText: display,
      });
    },
    [input, loading, pendingReceipts, postChat]
  );

  const retryLast = useCallback(async () => {
    const p = lastPayloadRef.current;
    if (!p || loading) return;
    await postChat({
      message: p.message,
      receipts: p.receipts,
      showUserBubble: false,
    });
  }, [loading, postChat]);

  function onPickReceiptFiles(files: FileList | null) {
    if (!files?.length) return;
    const allowed = new Set(["image/jpeg", "image/png", "image/webp"]);
    setError(null);
    let queued = 0;
    for (const file of Array.from(files)) {
      if (queued >= 3) break;
      const mimeRaw = file.type === "image/jpg" ? "image/jpeg" : file.type;
      if (!allowed.has(mimeRaw)) {
        setError("Please use JPEG, PNG, or WebP images (up to 3).");
        continue;
      }
      const mimeType = mimeRaw as PendingReceipt["mimeType"];
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = String(reader.result ?? "");
        const comma = dataUrl.indexOf(",");
        const base64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
        if (!base64) return;
        if (base64.length > 5_000_000) {
          setError("Each image should be under about 3.7 MB.");
          return;
        }
        setPendingReceipts((prev) => {
          if (prev.length >= 3) return prev;
          return [
            ...prev,
            {
              id: crypto.randomUUID(),
              mimeType,
              base64,
              previewUrl: dataUrl.startsWith("data:") ? dataUrl : `data:${mimeType};base64,${base64}`,
            },
          ];
        });
      };
      reader.readAsDataURL(file);
      queued += 1;
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <header className="relative z-20 shrink-0 border-b border-border/70 bg-card/95 px-3 py-3 shadow-sm backdrop-blur-md sm:px-5">
        <div className="pointer-events-none absolute -right-10 -top-12 size-40 rounded-full bg-primary/[0.08] blur-2xl" aria-hidden />
        <div className="relative mx-auto flex max-w-3xl items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-10 shrink-0 touch-manipulation rounded-full [-webkit-tap-highlight-color:transparent]"
            aria-label="Chat history"
            onClick={() => setHistoryOpen(true)}
          >
            <History className="size-5 text-muted-foreground" />
          </Button>
          <div className="min-w-0 flex-1 text-center sm:text-left">
            <h1 className="truncate text-base font-bold tracking-tight text-foreground sm:text-lg">Invoice Copilot</h1>
            <p className="truncate text-[11px] font-medium text-muted-foreground sm:text-xs">{sessionHeading}</p>
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="h-9 shrink-0 touch-manipulation gap-1 rounded-full px-3 text-xs font-semibold [-webkit-tap-highlight-color:transparent] sm:px-4"
            onClick={startNewChat}
          >
            <Plus className="size-3.5 sm:hidden" aria-hidden />
            <span className="hidden sm:inline">New chat</span>
            <span className="sm:hidden">New</span>
          </Button>
        </div>
      </header>

      <ChatSessionsDrawer
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        sessions={sessions}
        loading={sessionsLoading}
        currentSessionId={sessionId}
        onSelect={selectSession}
        onRename={openRename}
        onDelete={deleteSession}
      />

      <Dialog
        open={renameOpen}
        onOpenChange={(o) => {
          if (!renameSaving) setRenameOpen(o);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Rename conversation</DialogTitle>
            <DialogDescription>This title is only for you — it helps find threads in history.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 px-1 py-2">
            <Label htmlFor="rename-title">Title</Label>
            <Input
              id="rename-title"
              value={renameDraft}
              onChange={(e) => setRenameDraft(e.target.value)}
              className="h-11 rounded-xl"
              maxLength={200}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" disabled={renameSaving} onClick={() => setRenameOpen(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={renameSaving || !renameDraft.trim()} onClick={() => void submitRename()}>
              {renameSaving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="relative min-h-0 flex-1">
        {threadLoading && sessionId ? (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-start justify-center bg-background/40 pt-24 backdrop-blur-[1px]">
            <div className="flex items-center gap-2 rounded-full border border-border/80 bg-card px-4 py-2 text-sm font-medium text-muted-foreground shadow-md">
              <Loader2 className="size-4 animate-spin text-primary" aria-hidden />
              Syncing messages…
            </div>
          </div>
        ) : null}

        <div
          ref={scrollRef}
          className="h-full min-h-0 space-y-4 overflow-y-auto overscroll-y-contain px-3 py-5 sm:px-6"
        >
          {messages.length === 0 && !sessionId ? (
            <div className="mx-auto flex max-w-xl flex-col px-1 pt-2 sm:pt-6">
              <div className="mb-8 flex justify-center">
                <div className="relative">
                  <div className="absolute inset-0 rounded-3xl bg-primary/20 blur-xl" aria-hidden />
                  <div className="relative flex size-[4.5rem] items-center justify-center rounded-3xl bg-card shadow-card ring-1 ring-border/80">
                    <Sparkles className="size-9 text-primary" strokeWidth={1.35} />
                  </div>
                </div>
              </div>
              <h2 className="text-balance text-center text-2xl font-bold tracking-tight text-foreground sm:text-[1.75rem] sm:leading-snug">
                How can I help today?
              </h2>
              <p className="mx-auto mt-3 max-w-md text-pretty text-center text-[15px] leading-relaxed text-muted-foreground">
                Invoices, clients, expenses, and balances — tap a suggestion or type below. Conversations are saved
                automatically; use History to reopen them.
              </p>
              <div className="mt-10 -mx-1 flex gap-2 overflow-x-auto pb-2 pt-1 sm:mx-0 sm:flex-wrap sm:justify-center">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    disabled={loading}
                    onClick={() => void send(s)}
                    className="touch-manipulation [-webkit-tap-highlight-color:transparent] shrink-0 rounded-full border border-border/90 bg-card px-4 py-2.5 text-[15px] font-semibold text-foreground shadow-sm ring-1 ring-border/40 transition active:scale-[0.98] hover:border-primary/25 hover:bg-primary/[0.04] hover:shadow-md disabled:opacity-50"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {messages.length === 0 && sessionId && !threadLoading ? (
            <p className="py-12 text-center text-sm text-muted-foreground">No messages in this thread yet.</p>
          ) : null}

          {messages.map((m) => (
            <div
              key={m.id}
              className={cn("flex w-full", m.role === "user" ? "justify-end" : "justify-start")}
            >
              <div
                className={cn(
                  "max-w-[min(100%,32rem)] px-4 py-3.5 text-[15px] leading-relaxed sm:text-[15px]",
                  m.role === "user"
                    ? "rounded-2xl rounded-br-md bg-primary text-primary-foreground shadow-[0_8px_30px_hsl(var(--primary)/0.35)]"
                    : "rounded-2xl rounded-bl-md border border-border/80 bg-card text-foreground shadow-card"
                )}
              >
                {m.role === "assistant" ? (
                  <div className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-primary">
                    <Sparkles className="size-3.5" aria-hidden />
                    Copilot
                  </div>
                ) : null}
                <div className="space-y-2 whitespace-pre-wrap">{m.content}</div>
                {(() => {
                  const logTime = formatChatLogTimestamp(m.createdAt);
                  if (!logTime) return null;
                  return (
                    <p
                      className={cn(
                        "mt-2 text-[11px] font-medium tabular-nums tracking-tight",
                        m.role === "user" ? "text-primary-foreground/75" : "text-muted-foreground"
                      )}
                    >
                      <time dateTime={m.createdAt ?? undefined}>{logTime}</time>
                    </p>
                  );
                })()}
                {m.role === "assistant" && m.invoiceLinks && m.invoiceLinks.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-2 border-t border-border/60 pt-3">
                    {m.invoiceLinks.map((inv) => (
                      <Link
                        key={inv.id}
                        href={`/invoices/${inv.id}`}
                        className="inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/[0.07] px-3 py-1.5 text-xs font-semibold text-primary shadow-sm transition-colors hover:bg-primary/[0.12] hover:text-primary"
                      >
                        Open invoice #{inv.number}
                      </Link>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          ))}

          {loading ? (
            <div className="flex justify-start">
              <div className="flex items-center gap-3 rounded-2xl border border-border/80 bg-card px-4 py-3.5 text-[15px] font-medium text-muted-foreground shadow-card">
                <Loader2 className="size-4 shrink-0 animate-spin text-primary" aria-hidden />
                Working on your request…
              </div>
            </div>
          ) : null}

          {lastSteps?.length && !loading ? (
            <div className="flex justify-start">
              <Collapsible className="group w-full max-w-[min(100%,32rem)]">
                <div className="rounded-2xl border border-border/80 bg-card/95 px-3 py-2 shadow-card backdrop-blur-sm">
                  <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 rounded-xl px-2 py-2 text-left text-[15px] font-semibold text-foreground hover:bg-muted/60">
                    <span>
                      {lastSteps.length} step{lastSteps.length === 1 ? "" : "s"} completed
                    </span>
                    <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
                  </CollapsibleTrigger>
                  <CollapsibleContent className="space-y-2 px-2 pb-2 pt-1">
                    {lastPlan?.goal ? (
                      <p className="text-xs text-muted-foreground">
                        <span className="font-semibold text-foreground">Goal:</span> {lastPlan.goal}
                      </p>
                    ) : null}
                    <div className="flex flex-wrap gap-1.5">
                      {lastSteps.map((s, i) => (
                        <Badge
                          key={s.stepId}
                          variant="secondary"
                          className={cn(
                            "border-0 bg-muted/90 font-medium text-foreground",
                            s.status === "error" && "bg-destructive/12 text-destructive"
                          )}
                        >
                          {i + 1}. {s.action}
                        </Badge>
                      ))}
                    </div>
                    <details className="text-xs text-muted-foreground">
                      <summary className="cursor-pointer select-none font-semibold text-foreground/80 hover:text-foreground">
                        Raw JSON
                      </summary>
                      <pre className="mt-2 max-h-36 overflow-auto rounded-xl bg-muted/50 p-3 text-[10px] leading-snug ring-1 ring-border/50">
                        {JSON.stringify({ plan: lastPlan, steps: lastSteps }, null, 2)}
                      </pre>
                    </details>
                  </CollapsibleContent>
                </div>
              </Collapsible>
            </div>
          ) : null}
        </div>
      </div>

      <div className="shrink-0 border-t border-border/70 bg-[hsl(var(--chat-composer))]/95 px-3 pb-3 pt-3 shadow-[0_-12px_40px_hsl(224_47%_11%/0.05)] backdrop-blur-md sm:px-6">
        {error ? (
          <div className="mb-3 flex flex-col gap-2 rounded-xl border border-destructive/25 bg-destructive/10 px-3 py-2.5">
            <p className="text-[13px] font-medium leading-snug text-destructive whitespace-pre-line">{error}</p>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="h-9 touch-manipulation gap-1.5 rounded-lg font-semibold [-webkit-tap-highlight-color:transparent]"
                onClick={() => void retryLast()}
                disabled={loading || !lastPayloadRef.current}
              >
                <RotateCcw className="size-3.5" aria-hidden />
                Retry
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-9 touch-manipulation rounded-lg font-semibold"
                onClick={() => setError(null)}
              >
                Dismiss
              </Button>
            </div>
          </div>
        ) : null}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          className="hidden"
          onChange={(e) => onPickReceiptFiles(e.target.files)}
        />
        {pendingReceipts.length ? (
          <div className="mx-auto mb-3 flex max-w-3xl flex-wrap gap-2 px-1">
            {pendingReceipts.map((r) => (
              <div
                key={r.id}
                className="relative size-[4.25rem] overflow-hidden rounded-xl border border-border/80 bg-card shadow-sm ring-1 ring-border/40"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={r.previewUrl} alt="" className="size-full object-cover" />
                <button
                  type="button"
                  className="absolute right-1 top-1 flex size-7 touch-manipulation items-center justify-center rounded-full bg-foreground/75 text-background backdrop-blur-sm [-webkit-tap-highlight-color:transparent] active:scale-95"
                  aria-label="Remove receipt"
                  onClick={() => setPendingReceipts((p) => p.filter((x) => x.id !== r.id))}
                >
                  <X className="size-3.5" />
                </button>
              </div>
            ))}
          </div>
        ) : null}

        <div className="mx-auto flex max-w-3xl items-end gap-2 rounded-[1.85rem] border border-border/90 bg-card p-1.5 pl-2 shadow-[0_12px_40px_hsl(224_47%_11%/0.08)] ring-1 ring-border/30">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={loading || pendingReceipts.length >= 3}
            className="size-11 shrink-0 touch-manipulation rounded-full text-muted-foreground [-webkit-tap-highlight-color:transparent] hover:bg-muted hover:text-foreground active:scale-95"
            aria-label="Attach receipt screenshot"
            onClick={() => fileInputRef.current?.click()}
          >
            {pendingReceipts.length ? (
              <ImagePlus className="size-5" aria-hidden />
            ) : (
              <Paperclip className="size-5" aria-hidden />
            )}
          </Button>
          <textarea
            ref={textareaRef}
            rows={1}
            placeholder="Ask anything…"
            value={input}
            disabled={loading}
            onChange={(e) => {
              setInput(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            className="max-h-[120px] min-h-[44px] flex-1 resize-none border-0 bg-transparent py-2.5 pl-1 text-[15px] leading-snug text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-0 disabled:opacity-50"
          />
          <Button
            type="button"
            size="icon"
            disabled={loading || (!input.trim() && pendingReceipts.length === 0)}
            onClick={() => void send()}
            className="size-11 shrink-0 touch-manipulation rounded-full shadow-md [-webkit-tap-highlight-color:transparent] active:scale-95"
            aria-label="Send"
          >
            {loading ? (
              <Loader2 className="size-5 animate-spin" aria-hidden />
            ) : (
              <Send className="size-5" aria-hidden />
            )}
          </Button>
        </div>
        <p className="mt-2.5 text-center text-[11px] leading-snug text-muted-foreground">
          AI can make mistakes — double-check amounts on receipts and invoices before relying on them.
        </p>
      </div>
    </div>
  );
}
