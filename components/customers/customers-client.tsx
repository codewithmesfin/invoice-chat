"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { EmptyState } from "@/components/layout/empty-state";
import { friendlyUserMessage, parseJsonSafe, type ApiErrorBody } from "@/lib/http/api-user-message";
import { cn } from "@/lib/utils";

type Customer = {
  id: string;
  name: string;
  email: string | null;
  notes: string | null;
  created_at: string;
};

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Deterministic “WhatsApp-style” avatar colors from name */
function avatarClass(name: string) {
  const hues = [
    "bg-[#5c6bc0] text-white ring-white/20",
    "bg-[#00897b] text-white ring-white/20",
    "bg-[#d84315] text-white ring-white/20",
    "bg-[#6a1b9a] text-white ring-white/20",
    "bg-[#1565c0] text-white ring-white/20",
    "bg-[#c62828] text-white ring-white/20",
    "bg-[#2e7d32] text-white ring-white/20",
    "bg-[#ad1457] text-white ring-white/20",
    "bg-[#4527a0] text-white ring-white/20",
    "bg-[#00695c] text-white ring-white/20",
  ];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return hues[Math.abs(h) % hues.length];
}

function subtitleLine(c: Customer) {
  const email = c.email?.trim();
  const notes = c.notes?.trim();
  if (email) return email;
  if (notes) return notes;
  return "No email on file";
}

export function CustomersClient() {
  const [rows, setRows] = useState<Customer[]>([]);
  const [listError, setListError] = useState<string | null>(null);
  const [listLoading, setListLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const sorted = useMemo(
    () => [...rows].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" })),
    [rows]
  );

  const load = useCallback(async () => {
    setListError(null);
    setListLoading(true);
    try {
      const res = await fetch("/api/customers");
      const raw = await parseJsonSafe(res);
      const body = raw as { customers?: Customer[] } & ApiErrorBody | null;
      if (!res.ok) {
        setRows([]);
        setListError(friendlyUserMessage(res.status, body, "Couldn’t load your clients."));
        return;
      }
      setRows(body?.customers ?? []);
    } catch {
      setRows([]);
      setListError("We couldn’t reach the server. Check your connection and pull to refresh.");
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function openModal() {
    setFormError(null);
    setModalOpen(true);
  }

  function closeModal() {
    if (saving) return;
    setModalOpen(false);
    setFormError(null);
  }

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSaving(true);
    try {
      const res = await fetch("/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email: email || undefined, notes: notes || undefined }),
      });
      const raw = await parseJsonSafe(res);
      const body = raw as ApiErrorBody | null;
      if (!res.ok) {
        setFormError(friendlyUserMessage(res.status, body, "Couldn’t save this client."));
        return;
      }
      setName("");
      setEmail("");
      setNotes("");
      setModalOpen(false);
      await load();
    } catch {
      setFormError("Network issue — try again when you’re back online.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Native-style header */}
      <div className="sticky top-0 z-30 border-b border-border/60 bg-card/95 px-4 py-3 backdrop-blur-md supports-[backdrop-filter]:bg-card/80 sm:rounded-t-xl">
        <div className="mx-auto flex max-w-lg items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Clients</p>
            <h1 className="truncate text-[1.35rem] font-bold leading-tight tracking-tight text-foreground">
              {listLoading ? "…" : `${sorted.length}`}
            </h1>
          </div>
          <Button
            type="button"
            size="icon"
            onClick={openModal}
            className="hidden size-11 shrink-0 rounded-full shadow-md sm:inline-flex"
            aria-label="New client"
          >
            <Plus className="size-6" strokeWidth={2.25} aria-hidden />
          </Button>
        </div>
      </div>

      {listError ? (
        <div className="mx-4 mt-3 rounded-xl border border-destructive/25 bg-destructive/10 px-3 py-2.5">
          <p className="text-sm font-medium text-destructive">{listError}</p>
          <Button type="button" variant="secondary" size="sm" className="mt-2 h-9 rounded-lg font-semibold" onClick={() => void load()}>
            Try again
          </Button>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 bg-[hsl(220_14%_96%)]">
        {listLoading ? (
          <div className="space-y-0 divide-y divide-border/60">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3.5">
                <div className="size-[3.25rem] shrink-0 animate-pulse rounded-full bg-muted" />
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="h-4 w-40 animate-pulse rounded-md bg-muted" />
                  <div className="h-3 w-56 max-w-full animate-pulse rounded-md bg-muted/70" />
                </div>
              </div>
            ))}
          </div>
        ) : sorted.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={<Users className="size-7 text-primary" strokeWidth={1.5} />}
              title="No clients yet"
              description="Tap + to add someone. They’ll appear in this list like your favorite chat apps — tap a row to open details."
              action={
                <Button type="button" onClick={openModal} className="rounded-full px-6 font-semibold shadow-sm">
                  New client
                </Button>
              }
            />
          </div>
        ) : (
          <ul className="divide-y divide-border/70">
            {sorted.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/customers/${c.id}`}
                  className={cn(
                    "flex min-h-[4.5rem] items-center gap-3 px-4 py-2.5 transition-colors active:bg-muted/80",
                    "touch-manipulation [-webkit-tap-highlight-color:transparent]"
                  )}
                >
                  <div
                    className={cn(
                      "flex size-[3.25rem] shrink-0 items-center justify-center rounded-full text-[0.95rem] font-bold tabular-nums ring-2",
                      avatarClass(c.name)
                    )}
                  >
                    {initials(c.name)}
                  </div>
                  <div className="min-w-0 flex-1 py-1.5">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="truncate text-[1.05rem] font-semibold leading-snug text-foreground">{c.name}</p>
                    </div>
                    <p className="mt-0.5 truncate text-[0.9rem] leading-snug text-muted-foreground">
                      {subtitleLine(c)}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* FAB above bottom nav — same action as header + */}
      {!listLoading && sorted.length > 0 ? (
        <Button
          type="button"
          size="icon"
          onClick={openModal}
          className="fixed bottom-[calc(5.25rem+env(safe-area-inset-bottom,0px))] right-4 z-40 size-14 rounded-full shadow-lg sm:bottom-[calc(5.5rem+env(safe-area-inset-bottom,0px))] sm:right-6 md:hidden"
          aria-label="New client"
        >
          <Plus className="size-7" strokeWidth={2.25} aria-hidden />
        </Button>
      ) : null}

      <Dialog open={modalOpen} onOpenChange={(o) => (o ? setModalOpen(true) : closeModal())}>
        <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New client</DialogTitle>
            <DialogDescription>Add a contact for invoices and reminders. You can edit details later from their profile.</DialogDescription>
          </DialogHeader>
          <form onSubmit={onCreate} className="flex max-h-[min(70dvh,520px)] flex-col">
            <div className="space-y-4 overflow-y-auto overscroll-contain px-5 pb-2 pt-1">
              {formError ? (
                <p className="rounded-lg border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">
                  {formError}
                </p>
              ) : null}
              <div className="space-y-2">
                <Label htmlFor="client-name" className="text-sm font-semibold text-foreground">
                  Name
                </Label>
                <Input
                  id="client-name"
                  className="h-12 rounded-xl text-base"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  autoComplete="name"
                  placeholder="Company or person"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="client-email" className="text-sm font-semibold text-foreground">
                  Email
                </Label>
                <Input
                  id="client-email"
                  type="email"
                  inputMode="email"
                  className="h-12 rounded-xl text-base"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  placeholder="name@company.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="client-notes" className="text-sm font-semibold text-foreground">
                  Notes <span className="font-normal text-muted-foreground">(optional)</span>
                </Label>
                <Input
                  id="client-notes"
                  className="h-12 rounded-xl text-base"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Billing address, VAT ID, etc."
                />
              </div>
            </div>
            <DialogFooter className="bg-muted/30 px-5 py-4">
              <Button type="button" variant="ghost" className="h-12 rounded-xl font-semibold" onClick={closeModal} disabled={saving}>
                Cancel
              </Button>
              <Button type="submit" className="h-12 rounded-xl px-6 text-base font-semibold shadow-sm" disabled={saving}>
                {saving ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
