"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FileText, MessageSquareText, Receipt, Settings2, Users } from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { href: "/chat", label: "Chat", icon: MessageSquareText },
  { href: "/customers", label: "Clients", icon: Users },
  { href: "/invoices", label: "Invoices", icon: FileText },
  { href: "/expenses", label: "Expenses", icon: Receipt },
  { href: "/settings", label: "Me", icon: Settings2 },
] as const;

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="pointer-events-auto fixed inset-x-0 bottom-0 z-[95] w-full max-w-[100vw] border-t border-border/80 bg-card/95 shadow-[0_-12px_40px_hsl(224_47%_11%/0.08)] backdrop-blur-xl backdrop-saturate-150 [backface-visibility:hidden] lg:hidden"
      style={{ paddingBottom: "max(0.45rem, env(safe-area-inset-bottom, 0px))" }}
      aria-label="Primary"
    >
      <div className="mx-auto flex h-[3.35rem] max-w-xl min-w-0 items-stretch justify-between gap-0.5 overflow-x-auto px-1.5 sm:h-14 sm:max-w-2xl sm:px-3">
        {items.map(({ href, label, icon: Icon }) => {
          const active =
            pathname === href ||
            (href !== "/chat" && href !== "/settings" && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "group relative flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl py-1 text-sm font-semibold tracking-tight text-muted-foreground transition-colors",
                active && "text-primary"
              )}
            >
               <Icon
                  className="size-[1.15rem] shrink-0 sm:size-[22px]"
                  strokeWidth={active ? 2.35 : 1.9}
                  aria-hidden
                />
              <span className="relative z-[1] max-w-full truncate px-0.5">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
