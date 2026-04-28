"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MessageSquare, Plus, Receipt, TrendingDown, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
import { EmptyState } from "@/components/layout/empty-state";
import { friendlyUserMessage, parseJsonSafe, type ApiErrorBody } from "@/lib/http/api-user-message";

export type ExpenseRow = {
  id: string;
  amount_cents: number;
  currency: string;
  spent_at: string;
  category: string | null;
  merchant: string | null;
  description: string | null;
  receipt_storage_path: string | null;
  source: string;
  created_at: string;
};

const selectClass =
  "flex h-12 w-full rounded-xl border border-input bg-card px-3 text-base text-foreground shadow-sm transition-colors focus-visible:border-primary/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30";

function money(cents: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

function sourceLabel(source: string) {
  if (source === "chat_receipt") return "Receipt";
  if (source === "chat_text") return "Chat";
  return "Manual";
}

export function ExpensesClient() {
  const [rows, setRows] = useState<ExpenseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [spentAt, setSpentAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [category, setCategory] = useState("");
  const [merchant, setMerchant] = useState("");
  const [description, setDescription] = useState("");
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const receiptInputRef = useRef<HTMLInputElement>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setListError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/expenses");
      const raw = await parseJsonSafe(res);
      const j = raw as { expenses?: ExpenseRow[] } & ApiErrorBody | null;
      if (!res.ok) {
        setRows([]);
        setListError(friendlyUserMessage(res.status, j, "Could not load expenses."));
      } else {
        setRows(j?.expenses ?? []);
      }
    } catch {
      setRows([]);
      setListError("We couldn’t reach the server. Try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const monthTotal = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    let cents = 0;
    let cur = "USD";
    for (const r of rows) {
      const d = new Date(r.spent_at);
      if (d.getFullYear() === y && d.getMonth() === m) {
        cents += r.amount_cents;
        cur = r.currency || cur;
      }
    }
    return { cents, currency: cur };
  }, [rows]);

  function openModal() {
    setFormError(null);
    setReceiptFile(null);
    if (receiptInputRef.current) receiptInputRef.current.value = "";
    setSpentAt(new Date().toISOString().slice(0, 10));
    setModalOpen(true);
  }

  function closeModal() {
    if (saving) return;
    setModalOpen(false);
    setFormError(null);
    setReceiptFile(null);
    if (receiptInputRef.current) receiptInputRef.current.value = "";
  }

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSaving(true);
    try {
      let receipt_storage_path: string | null = null;
      if (receiptFile) {
        const fd = new FormData();
        fd.set("file", receiptFile);
        const upRes = await fetch("/api/expenses/receipt", { method: "POST", body: fd });
        const upRaw = await parseJsonSafe(upRes);
        const upBody = upRaw as { path?: string } & ApiErrorBody;
        if (!upRes.ok) {
          setFormError(friendlyUserMessage(upRes.status, upBody, "Couldn’t upload the receipt image."));
          return;
        }
        if (upBody.path) receipt_storage_path = upBody.path;
      }

      const res = await fetch("/api/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount,
          currency: currency.trim() || "USD",
          spent_at: spentAt,
          category: category.trim() || null,
          merchant: merchant.trim() || null,
          description: description.trim() || null,
          receipt_storage_path,
        }),
      });
      const raw = await parseJsonSafe(res);
      const body = raw as ApiErrorBody;
      if (!res.ok) {
        setFormError(friendlyUserMessage(res.status, body, "Couldn’t save this expense."));
        return;
      }
      setAmount("");
      setCategory("");
      setMerchant("");
      setDescription("");
      setReceiptFile(null);
      if (receiptInputRef.current) receiptInputRef.current.value = "";
      setModalOpen(false);
      await load();
    } catch {
      setFormError("Network issue — try again.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-4 px-4 pb-28 pt-2 sm:px-0">
        <div className="sticky top-0 z-30 border-b border-border/60 bg-card/95 px-0 py-3 backdrop-blur-md">
          <div className="mx-auto max-w-lg">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Spend</p>
            <h1 className="text-[1.35rem] font-bold">Expenses</h1>
          </div>
        </div>
        <div className="h-24 animate-pulse rounded-2xl bg-muted/60" />
        <div className="h-40 animate-pulse rounded-2xl bg-muted/40" />
      </div>
    );
  }

  if (listError) {
    return (
      <div className="px-4 pb-28 pt-2 sm:px-0">
        <Card className="border-destructive/25 bg-destructive/[0.04]">
          <CardContent className="p-5 pt-5">
            <p className="text-sm font-medium text-destructive">{listError}</p>
            <p className="mt-2 text-xs text-muted-foreground">
              If you just added the expenses table, apply migrations and refresh. You can still log spend from{" "}
              <Link href="/chat" className="font-semibold text-primary underline-offset-2 hover:underline">
                Chat
              </Link>
              .
            </p>
            <Button type="button" variant="secondary" className="mt-4" onClick={() => void load()}>
              Try again
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="sticky top-0 z-30 border-b border-border/60 bg-card/95 px-4 py-3 backdrop-blur-md supports-[backdrop-filter]:bg-card/80 sm:rounded-t-xl">
        <div className="mx-auto flex max-w-lg items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Spend</p>
            <h1 className="truncate text-[1.35rem] font-bold leading-tight tracking-tight text-foreground">
              Expenses · {rows.length}
            </h1>
          </div>
          <Button
            type="button"
            size="icon"
            onClick={openModal}
            className="hidden size-11 shrink-0 rounded-full shadow-md sm:inline-flex"
            aria-label="New expense"
          >
            <Plus className="size-6" strokeWidth={2.25} aria-hidden />
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-6 px-4 pb-28 pt-5 sm:px-0">
        <Card className="overflow-hidden border-primary/15 bg-gradient-to-br from-primary/[0.07] via-card to-card">
          <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-end sm:justify-between sm:p-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-primary/80">This month</p>
              <p className="mt-1 text-3xl font-bold tracking-tight text-foreground tabular-nums">
                {money(monthTotal.cents, monthTotal.currency)}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">Total from expenses dated in the current calendar month.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={openModal} className="gap-2 shadow-sm">
                <Plus className="size-4" aria-hidden />
                Add expense
              </Button>
              <Button type="button" variant="outline" className="gap-2 font-semibold" asChild>
                <Link href="/chat">
                  <MessageSquare className="size-4" aria-hidden />
                  Log in chat
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        {rows.length === 0 ? (
          <EmptyState
            icon={<Receipt className="size-7 text-primary" strokeWidth={1.5} />}
            title="No expenses yet"
            description="Use the form for quick manual entries, or chat with a receipt photo for AI-assisted capture."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Button type="button" onClick={openModal}>
                  Add expense
                </Button>
                <Button type="button" variant="outline" asChild>
                  <Link href="/chat">Open chat</Link>
                </Button>
              </div>
            }
          />
        ) : (
          <ul className="space-y-3">
            {rows.map((r) => (
              <li key={r.id}>
                <Card className="overflow-hidden transition-shadow hover:shadow-card-hover">
                  <CardContent className="flex gap-4 p-4 sm:p-5">
                    <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-muted/90 text-muted-foreground ring-1 ring-border/60 sm:size-12">
                      <TrendingDown className="size-5 text-primary/80 sm:size-5" aria-hidden />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-semibold text-foreground">
                            {r.merchant?.trim() || r.category?.trim() || "Expense"}
                          </p>
                          {r.description ? (
                            <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{r.description}</p>
                          ) : null}
                        </div>
                        <p className="shrink-0 text-lg font-bold tabular-nums text-foreground">
                          {money(r.amount_cents, r.currency)}
                        </p>
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <span className="text-xs text-muted-foreground">
                          {new Date(r.spent_at).toLocaleDateString(undefined, {
                            weekday: "short",
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </span>
                        {r.category ? (
                          <Badge variant="secondary" className="border-0 bg-muted font-medium capitalize">
                            {r.category}
                          </Badge>
                        ) : null}
                        <Badge variant="secondary" className="border-0 bg-primary/[0.08] font-medium text-primary">
                          {sourceLabel(r.source)}
                        </Badge>
                        {r.receipt_storage_path ? (
                          <Badge variant="outline" className="font-normal text-muted-foreground">
                            Receipt
                          </Badge>
                        ) : null}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>

      {rows.length > 0 ? (
        <Button
          type="button"
          size="icon"
          onClick={openModal}
          className="fixed bottom-[calc(5.25rem+env(safe-area-inset-bottom,0px))] right-4 z-40 size-14 rounded-full shadow-lg sm:bottom-[calc(5.5rem+env(safe-area-inset-bottom,0px))] sm:right-6 md:hidden"
          aria-label="New expense"
        >
          <Plus className="size-7" strokeWidth={2.25} aria-hidden />
        </Button>
      ) : null}

      <Dialog open={modalOpen} onOpenChange={(o) => (o ? setModalOpen(true) : closeModal())}>
        <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New expense</DialogTitle>
            <DialogDescription>
              Log spend manually. Optional receipt image uploads privately to your workspace (JPEG, PNG, or WebP, up to
              5 MB).
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={onCreate} className="flex max-h-[min(78dvh,620px)] flex-col">
            <div className="space-y-4 overflow-y-auto overscroll-contain px-5 pb-2 pt-1">
              {formError ? (
                <p className="rounded-lg border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">
                  {formError}
                </p>
              ) : null}
              <div className="space-y-2">
                <Label htmlFor="exp-amt" className="text-sm font-semibold text-foreground">
                  Amount
                </Label>
                <Input
                  id="exp-amt"
                  inputMode="decimal"
                  className="h-12 rounded-xl text-base"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                  placeholder="0.00"
                />
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="exp-cur" className="text-sm font-semibold text-foreground">
                    Currency
                  </Label>
                  <Input
                    id="exp-cur"
                    className="h-12 rounded-xl text-base uppercase"
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                    maxLength={8}
                    placeholder="USD"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="exp-date" className="text-sm font-semibold text-foreground">
                    Date spent
                  </Label>
                  <Input
                    id="exp-date"
                    type="date"
                    className="h-12 rounded-xl text-base"
                    value={spentAt}
                    onChange={(e) => setSpentAt(e.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="exp-merchant" className="text-sm font-semibold text-foreground">
                  Merchant <span className="font-normal text-muted-foreground">(optional)</span>
                </Label>
                <Input
                  id="exp-merchant"
                  className="h-12 rounded-xl text-base"
                  value={merchant}
                  onChange={(e) => setMerchant(e.target.value)}
                  placeholder="Coffee shop, airline, …"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="exp-cat" className="text-sm font-semibold text-foreground">
                  Category <span className="font-normal text-muted-foreground">(optional)</span>
                </Label>
                <select
                  id="exp-cat"
                  className={selectClass}
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                >
                  <option value="">Select…</option>
                  {["Meals", "Travel", "Software", "Office", "Marketing", "Professional services", "Other"].map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="exp-desc" className="text-sm font-semibold text-foreground">
                  Notes <span className="font-normal text-muted-foreground">(optional)</span>
                </Label>
                <Input
                  id="exp-desc"
                  className="h-12 rounded-xl text-base"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What was this for?"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-foreground">
                  Receipt photo <span className="font-normal text-muted-foreground">(optional)</span>
                </Label>
                <input
                  ref={receiptInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null;
                    setReceiptFile(f);
                  }}
                />
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    className="h-11 gap-2 rounded-xl font-semibold"
                    onClick={() => receiptInputRef.current?.click()}
                  >
                    <Upload className="size-4" aria-hidden />
                    {receiptFile ? receiptFile.name : "Choose image"}
                  </Button>
                  {receiptFile ? (
                    <Button type="button" variant="ghost" size="sm" className="h-11" onClick={() => {
                      setReceiptFile(null);
                      if (receiptInputRef.current) receiptInputRef.current.value = "";
                    }}>
                      Clear
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>
            <DialogFooter className="bg-muted/30 px-5 py-4">
              <Button type="button" variant="ghost" className="h-12 rounded-xl font-semibold" onClick={closeModal} disabled={saving}>
                Cancel
              </Button>
              <Button type="submit" className="h-12 rounded-xl px-6 text-base font-semibold shadow-sm" disabled={saving}>
                {saving ? "Saving…" : "Save expense"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
