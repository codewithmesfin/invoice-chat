"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FileText, MessageSquareText, Receipt, Settings2, Sparkles, Users } from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { href: "/chat", label: "Chat", icon: MessageSquareText },
  { href: "/customers", label: "Clients", icon: Users },
  { href: "/invoices", label: "Invoices", icon: FileText },
  { href: "/expenses", label: "Expenses", icon: Receipt },
  { href: "/settings", label: "Profile", icon: Settings2 },
] as const;

export function DesktopAppRail() {
  const pathname = usePathname();

  return (
    <aside
      className="relative z-[96] hidden w-[4.75rem] shrink-0 flex-col border-r border-border/70 bg-card/95 py-3 shadow-sm backdrop-blur-md lg:flex"
      aria-label="App"
    >
      <div className="mb-4 flex justify-center px-1">
        <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
          <Sparkles className="size-5 shrink-0" strokeWidth={2} aria-hidden />
        </div>
      </div>
      <nav className="flex flex-1 flex-col gap-1 px-2">
        {items.map(({ href, label, icon: Icon }) => {
          const active =
            pathname === href ||
            (href !== "/chat" && href !== "/settings" && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              title={label}
              className={cn(
                "flex flex-col items-center justify-center gap-1 rounded-xl py-2.5 text-[9px] font-semibold tracking-tight text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground",
                active && "bg-primary/[0.12] text-primary"
              )}
            >
              <Icon className="size-[1.35rem] shrink-0" strokeWidth={active ? 2.35 : 1.85} aria-hidden />
              <span className="max-w-full truncate px-0.5">{label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
