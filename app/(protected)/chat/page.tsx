import { AgentChat } from "@/components/chat/agent-chat";

export default function ChatPage() {
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-[hsl(var(--chat-canvas))]">
      <AgentChat />
    </div>
  );
}
