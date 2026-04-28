"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronRight, FileText, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/layout/empty-state";
import { friendlyUserMessage, parseJsonSafe, type ApiErrorBody } from "@/lib/http/api-user-message";
import { cn } from "@/lib/utils";

type Customer = { id: string; name: string };

type InvoiceRow = {
  id: string;
  number: string;
  status: string;
  payment_status?: string | null;
  due_date: string | null;
  currency: string;
  total_cents: number;
  customers: { name: string; email?: string | null } | null;
};

const selectClass =
  "flex h-12 w-full rounded-xl border border-input bg-card px-3 text-base text-foreground shadow-sm transition-colors focus-visible:border-primary/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30";

function statusTone(status: string) {
  const s = status.toLowerCase();
  if (s === "paid") return "bg-emerald-500/12 text-emerald-800 ring-emerald-500/20";
  if (s === "sent") return "bg-sky-500/12 text-sky-900 ring-sky-500/20";
  if (s === "overdue") return "bg-amber-500/15 text-amber-900 ring-amber-500/25";
  if (s === "cancelled") return "bg-muted text-muted-foreground ring-border";
  return "bg-muted/80 text-foreground ring-border/60";
}

export function InvoicesClient() {
  const router = useRouter();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [customerId, setCustomerId] = useState("");
  const [number, setNumber] = useState("");
  const [status, setStatus] = useState("draft");
  const [due, setDue] = useState("");
  const [total, setTotal] = useState("");
  const [notes, setNotes] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setListError(null);
    setListLoading(true);
    try {
      const [cRes, iRes] = await Promise.all([fetch("/api/customers"), fetch("/api/invoices")]);
      const cRaw = await parseJsonSafe(cRes);
      const iRaw = await parseJsonSafe(iRes);
      const cJson = (cRaw ?? {}) as { customers?: Customer[] } & ApiErrorBody;
      const iJson = (iRaw ?? {}) as { invoices?: InvoiceRow[] } & ApiErrorBody;
      if (!iRes.ok) {
        setInvoices([]);
        setListError(friendlyUserMessage(iRes.status, iJson, "Couldn’t load invoices."));
      } else {
        setInvoices(iJson.invoices ?? []);
      }
      if (cRes.ok && cJson.customers) setCustomers(cJson.customers);
    } catch {
      setInvoices([]);
      setListError("We couldn’t reach the server. Try again.");
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const draftCount = useMemo(
    () => invoices.filter((i) => i.status.toLowerCase() === "draft").length,
    [invoices]
  );

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
      const dollars = Number.parseFloat(total || "0");
      const total_cents = Math.round(dollars * 100);
      const res = await fetch("/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_id: customerId || null,
          number,
          status,
          due_date: due || null,
          total_cents,
          notes: notes || undefined,
        }),
      });
      const raw = await parseJsonSafe(res);
      const body = raw as { id?: string } & ApiErrorBody;
      if (!res.ok) {
        setFormError(friendlyUserMessage(res.status, body, "Couldn’t create this invoice."));
        return;
      }
      setNumber("");
      setDue("");
      setTotal("");
      setNotes("");
      setCustomerId("");
      setModalOpen(false);
      await load();
      if (body.id) router.push(`/invoices/${body.id}`);
    } catch {
      setFormError("Network issue — try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="sticky top-0 z-30 border-b border-border/60 bg-card/95 px-4 py-3 backdrop-blur-md supports-[backdrop-filter]:bg-card/80 sm:rounded-t-xl">
        <div className="mx-auto flex max-w-lg items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Billing</p>
            <h1 className="truncate text-[1.35rem] font-bold leading-tight tracking-tight text-foreground">
              {listLoading ? "…" : `Invoices · ${invoices.length}`}
            </h1>
          </div>
          <Button
            type="button"
            size="icon"
            onClick={openModal}
            className="hidden size-11 shrink-0 rounded-full shadow-md sm:inline-flex"
            aria-label="New invoice"
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

      <div className="flex flex-col gap-6 px-4 pb-28 pt-5 sm:px-0">
        <div className="grid gap-3 sm:grid-cols-2">
          <Card className="border-primary/10 bg-gradient-to-br from-primary/[0.06] to-card">
            <CardContent className="p-4 sm:p-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-primary/80">Pipeline</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">{invoices.length}</p>
              <p className="text-sm text-muted-foreground">Total invoices</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 sm:p-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Drafts</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">{draftCount}</p>
              <p className="text-sm text-muted-foreground">Not sent yet</p>
            </CardContent>
          </Card>
        </div>

        <section>
          <div className="mb-4 flex items-center justify-between gap-2">
            <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Recent</h2>
            <span className="text-xs font-medium text-muted-foreground">{invoices.length} total</span>
          </div>

          {invoices.length === 0 && !listLoading ? (
            <EmptyState
              icon={<FileText className="size-7 text-primary" strokeWidth={1.5} />}
              title="No invoices yet"
              description="Create an invoice in seconds — add a number, amount, and client. Payment links and files live on the detail page."
              action={
                <Button type="button" onClick={openModal} className="rounded-full px-6 font-semibold shadow-sm">
                  New invoice
                </Button>
              }
            />
          ) : listLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-24 animate-pulse rounded-2xl bg-muted/50" />
              ))}
            </div>
          ) : (
            <ul className="space-y-3">
              {invoices.map((inv) => (
                <li key={inv.id}>
                  <Link
                    href={`/invoices/${inv.id}`}
                    className="group flex flex-col gap-2 rounded-2xl border border-border/80 bg-card p-4 shadow-card transition-all hover:border-primary/25 hover:shadow-card-hover sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:p-5"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-lg font-bold tracking-tight text-foreground">#{inv.number}</span>
                        <Badge
                          variant="secondary"
                          className={cn("border-0 font-semibold capitalize ring-1", statusTone(inv.status))}
                        >
                          {inv.status}
                        </Badge>
                        {inv.payment_status && inv.payment_status !== "none" ? (
                          <Badge variant="outline" className="border-primary/20 font-medium capitalize text-primary">
                            Pay: {inv.payment_status}
                          </Badge>
                        ) : null}
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        <span className="font-semibold tabular-nums text-foreground">
                          {(inv.total_cents / 100).toFixed(2)} {inv.currency}
                        </span>
                        {inv.customers?.name ? <> · {inv.customers.name}</> : null}
                      </p>
                      {inv.due_date ? <p className="text-xs text-muted-foreground">Due {inv.due_date}</p> : null}
                    </div>
                    <ChevronRight
                      className="size-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary sm:size-5"
                      aria-hidden
                    />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {!listLoading && invoices.length > 0 ? (
        <Button
          type="button"
          size="icon"
          onClick={openModal}
          className="fixed bottom-[calc(5.25rem+env(safe-area-inset-bottom,0px))] right-4 z-40 size-14 rounded-full shadow-lg sm:bottom-[calc(5.5rem+env(safe-area-inset-bottom,0px))] sm:right-6 md:hidden"
          aria-label="New invoice"
        >
          <Plus className="size-7" strokeWidth={2.25} aria-hidden />
        </Button>
      ) : null}

      <Dialog open={modalOpen} onOpenChange={(o) => (o ? setModalOpen(true) : closeModal())}>
        <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New invoice</DialogTitle>
            <DialogDescription>
              Link a client if you want. You can add line items later from the detail page if your workflow grows.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={onCreate} className="flex max-h-[min(70dvh,560px)] flex-col">
            <div className="space-y-4 overflow-y-auto overscroll-contain px-5 pb-2 pt-1">
              {formError ? (
                <p className="rounded-lg border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">
                  {formError}
                </p>
              ) : null}
              <div className="space-y-2">
                <Label htmlFor="inv-cust" className="text-sm font-semibold text-foreground">
                  Client
                </Label>
                <select
                  id="inv-cust"
                  className={selectClass}
                  value={customerId}
                  onChange={(e) => setCustomerId(e.target.value)}
                >
                  <option value="">Optional</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="inv-num" className="text-sm font-semibold text-foreground">
                  Invoice number
                </Label>
                <Input
                  id="inv-num"
                  className="h-12 rounded-xl text-base"
                  value={number}
                  onChange={(e) => setNumber(e.target.value)}
                  required
                  placeholder="e.g. 1042"
                />
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="inv-st" className="text-sm font-semibold text-foreground">
                    Status
                  </Label>
                  <select id="inv-st" className={selectClass} value={status} onChange={(e) => setStatus(e.target.value)}>
                    {["draft", "sent", "paid", "overdue", "cancelled"].map((s) => (
                      <option key={s} value={s}>
                        {s.charAt(0).toUpperCase() + s.slice(1)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="inv-due" className="text-sm font-semibold text-foreground">
                    Due date
                  </Label>
                  <Input
                    id="inv-due"
                    type="date"
                    className="h-12 rounded-xl text-base"
                    value={due}
                    onChange={(e) => setDue(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="inv-tot" className="text-sm font-semibold text-foreground">
                  Total (USD)
                </Label>
                <Input
                  id="inv-tot"
                  inputMode="decimal"
                  className="h-12 rounded-xl text-base"
                  placeholder="0.00"
                  value={total}
                  onChange={(e) => setTotal(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="inv-notes" className="text-sm font-semibold text-foreground">
                  Notes <span className="font-normal text-muted-foreground">(optional)</span>
                </Label>
                <Input
                  id="inv-notes"
                  className="h-12 rounded-xl text-base"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Memo on the invoice"
                />
              </div>
            </div>
            <DialogFooter className="bg-muted/30 px-5 py-4">
              <Button type="button" variant="ghost" className="h-12 rounded-xl font-semibold" onClick={closeModal} disabled={saving}>
                Cancel
              </Button>
              <Button type="submit" className="h-12 rounded-xl px-6 text-base font-semibold shadow-sm" disabled={saving}>
                {saving ? "Saving…" : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
