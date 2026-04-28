"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ChatSessionsList, type ChatSessionRow } from "@/components/chat/chat-sessions-list";

export type { ChatSessionRow };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessions: ChatSessionRow[];
  loading: boolean;
  currentSessionId: string | null;
  onSelect: (id: string) => void;
  onRename: (s: ChatSessionRow) => void;
  onDelete: (id: string, title: string | null) => void;
};

export function ChatSessionsDrawer({
  open,
  onOpenChange,
  sessions,
  loading,
  currentSessionId,
  onSelect,
  onRename,
  onDelete,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(88dvh,640px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-md">
        <DialogHeader className="border-b border-border/70 px-5 pb-3 pt-5 pr-14">
          <DialogTitle>Conversations</DialogTitle>
          <DialogDescription>Open a past thread or manage titles and deletions.</DialogDescription>
        </DialogHeader>
        <ChatSessionsList
          sessions={sessions}
          loading={loading}
          currentSessionId={currentSessionId}
          onSelect={(id) => {
            onSelect(id);
            onOpenChange(false);
          }}
          onRename={onRename}
          onDelete={onDelete}
        />
      </DialogContent>
    </Dialog>
  );
}
