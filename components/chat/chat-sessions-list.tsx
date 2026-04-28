"use client";

import { Loader2, MessageSquareText, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ChatSessionRow = {
  id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
};

export function formatSessionUpdated(iso: string) {
  try {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffM = Math.floor(diffMs / 60000);
    if (diffM < 1) return "Just now";
    if (diffM < 60) return `${diffM}m ago`;
    const diffH = Math.floor(diffM / 60);
    if (diffH < 24) return `${diffH}h ago`;
    const diffD = Math.floor(diffH / 24);
    if (diffD < 7) return `${diffD}d ago`;
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

type Props = {
  sessions: ChatSessionRow[];
  loading: boolean;
  currentSessionId: string | null;
  onSelect: (id: string) => void;
  onRename: (s: ChatSessionRow) => void;
  onDelete: (id: string, title: string | null) => void;
  /** Extra class on root scroll container */
  className?: string;
};

export function ChatSessionsList({
  sessions,
  loading,
  currentSessionId,
  onSelect,
  onRename,
  onDelete,
  className,
}: Props) {
  return (
    <div className={cn("min-h-0 flex-1 overflow-y-auto overscroll-contain", className)}>
      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm font-medium text-muted-foreground">
          <Loader2 className="size-4 animate-spin text-primary" aria-hidden />
          Loading…
        </div>
      ) : sessions.length === 0 ? (
        <p className="px-4 py-12 text-center text-sm leading-relaxed text-muted-foreground">
          No saved conversations yet. Send a message and it will appear here automatically.
        </p>
      ) : (
        <ul className="divide-y divide-border/70">
          {sessions.map((s) => {
            const active = s.id === currentSessionId;
            const label = (s.title ?? "Untitled chat").trim() || "Untitled chat";
            return (
              <li key={s.id} className="flex items-stretch">
                <button
                  type="button"
                  className={cn(
                    "min-h-[3.75rem] flex-1 px-3 py-3 text-left transition-colors touch-manipulation [-webkit-tap-highlight-color:transparent] active:bg-muted/80 lg:px-4",
                    active && "bg-primary/[0.08] ring-1 ring-inset ring-primary/15"
                  )}
                  onClick={() => onSelect(s.id)}
                >
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-primary ring-1 ring-border/60">
                      <MessageSquareText className="size-4" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-2 font-semibold text-foreground">{label}</span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">{formatSessionUpdated(s.updated_at)}</span>
                    </span>
                  </div>
                </button>
                <div className="flex shrink-0 flex-col border-l border-border/60 py-1 pr-1 lg:pr-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-10 rounded-lg text-muted-foreground hover:text-foreground"
                    aria-label={`Rename ${label}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onRename(s);
                    }}
                  >
                    <Pencil className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-10 rounded-lg text-destructive hover:text-destructive"
                    aria-label={`Delete ${label}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(s.id, s.title);
                    }}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
