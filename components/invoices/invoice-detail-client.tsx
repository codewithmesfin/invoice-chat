"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Clock,
  Copy,
  Link as LinkIcon,
  Mail,
  RefreshCw,
  Trash2,
  Upload,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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

type CustomerEmbed = { name: string | null; email: string | null } | null;

type InvoiceDetail = {
  id: string;
  number: string;
  status: string;
  payment_status: string | null;
  payment_share_token: string | null;
  due_date: string | null;
  currency: string;
  total_cents: number;
  notes: string | null;
  customer_id: string | null;
  created_at: string;
  updated_at: string;
  last_reminder_sent_at: string | null;
  reminder_count: number | null;
  customers: CustomerEmbed;
};

type Attachment = {
  id: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  created_at: string;
  extracted_text: string | null;
};

type TimelineRow = {
  id: string;
  at: string;
  kind: "payment" | "email";
  label: string;
  detail?: string | null;
};

function money(cents: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

function paymentBadge(status: string | null | undefined) {
  const s = status ?? "none";
  const map: Record<string, string> = {
    none: "bg-muted text-muted-foreground ring-border",
    pending_checkout: "bg-amber-500/12 text-amber-900 ring-amber-500/20",
    processing: "bg-sky-500/12 text-sky-900 ring-sky-500/20",
    succeeded: "bg-emerald-500/12 text-emerald-900 ring-emerald-500/20",
    failed: "bg-destructive/12 text-destructive ring-destructive/20",
    canceled: "bg-muted text-muted-foreground ring-border",
    refunded: "bg-violet-500/12 text-violet-900 ring-violet-500/25",
  };
  return map[s] ?? "bg-muted text-muted-foreground ring-border";
}

function sendPrereqs(inv: InvoiceDetail): { name: boolean; email: boolean } | null {
  if (!inv.customer_id) return { name: true, email: true };
  const n = inv.customers?.name?.trim();
  const e = inv.customers?.email?.trim();
  const needName = !n;
  const needEmail = !e;
  if (!needName && !needEmail) return null;
  return { name: needName, email: needEmail };
}

function backLink() {
  return (
    <Link
      href="/invoices"
      className="inline-flex items-center gap-2 rounded-full border border-border/80 bg-card px-3 py-1.5 text-sm font-semibold text-muted-foreground shadow-sm transition-colors hover:border-primary/30 hover:text-foreground"
    >
      <ArrowLeft className="size-4" aria-hidden />
      All invoices
    </Link>
  );
}

export function InvoiceDetailClient({ invoiceId }: { invoiceId: string }) {
  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [timeline, setTimeline] = useState<TimelineRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [payUrl, setPayUrl] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [sendDialogOpen, setSendDialogOpen] = useState(false);
  const [sendKind, setSendKind] = useState<"invoice_link" | "reminder">("invoice_link");
  const [sendName, setSendName] = useState("");
  const [sendEmailDraft, setSendEmailDraft] = useState("");
  const [sendFormError, setSendFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const [invRes, auditRes] = await Promise.all([
      fetch(`/api/invoices/${invoiceId}`),
      fetch(`/api/invoices/${invoiceId}/audit`),
    ]);
    if (!invRes.ok) {
      const j = (await invRes.json()) as { error?: string };
      setError(j.error ?? "Could not load invoice");
      setLoading(false);
      return;
    }
    const invJson = (await invRes.json()) as { invoice: InvoiceDetail; attachments: Attachment[] };
    setInvoice(invJson.invoice);
    setAttachments(invJson.attachments ?? []);

    if (auditRes.ok) {
      const a = (await auditRes.json()) as { timeline?: TimelineRow[] };
      setTimeline(a.timeline ?? []);
    }
    setLoading(false);
  }, [invoiceId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`invoice-row-${invoiceId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "invoices", filter: `id=eq.${invoiceId}` },
        () => {
          void load();
        }
      )
      .subscribe();

    const poll = window.setInterval(() => {
      void load();
    }, 20000);

    return () => {
      window.clearInterval(poll);
      void supabase.removeChannel(channel);
    };
  }, [invoiceId, load]);

  const customerEmail = invoice?.customers?.email?.trim();
  const emailSendBlocked = invoice ? invoice.total_cents < 50 : true;

  function openSendDialog(kind: "invoice_link" | "reminder") {
    if (!invoice) return;
    setSendKind(kind);
    setSendFormError(null);
    const p = sendPrereqs(invoice);
    if (!p) {
      void postSendEmail(kind, {});
      return;
    }
    setSendName(invoice.customers?.name?.trim() ?? "");
    setSendEmailDraft(invoice.customers?.email?.trim() ?? "");
    setSendDialogOpen(true);
  }

  async function postSendEmail(
    kind: "invoice_link" | "reminder",
    body: { customer_name?: string; customer_email?: string }
  ) {
    setBusy(kind === "reminder" ? "remind" : "email");
    setError(null);
    try {
      const res = await fetch(`/api/invoices/${invoiceId}/send-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, ...body }),
      });
      const j = (await res.json()) as {
        error?: string;
        message?: string;
        missing?: ("name" | "email")[];
        sent?: boolean;
      };
      if (!res.ok) {
        if (res.status === 422 && j.missing?.length) {
          const msg = j.message ?? "Add the missing client details.";
          if (sendDialogOpen) setSendFormError(msg);
          else setError(msg);
          return false;
        }
        setError(j.message ?? j.error ?? "Email failed");
        return false;
      }
      await load();
      return true;
    } finally {
      setBusy(null);
    }
  }

  async function ensurePaymentLink() {
    setBusy("link");
    setError(null);
    try {
      const res = await fetch(`/api/invoices/${invoiceId}/payment-link`, { method: "POST" });
      const j = (await res.json()) as { url?: string; error?: string };
      if (!res.ok) {
        setError(j.error ?? "Could not create link");
        return;
      }
      setPayUrl(j.url ?? null);
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function copyLink() {
    setBusy("copy");
    setError(null);
    try {
      let url = payUrl;
      if (!url) {
        const res = await fetch(`/api/invoices/${invoiceId}/payment-link`, { method: "POST" });
        const j = (await res.json()) as { url?: string; error?: string };
        if (!res.ok) {
          setError(j.error ?? "Could not create link");
          return;
        }
        url = j.url ?? null;
        setPayUrl(url);
      }
      if (url) await navigator.clipboard.writeText(url);
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function submitSendDialog(e: React.FormEvent) {
    e.preventDefault();
    if (!invoice) return;
    setSendFormError(null);
    const p = sendPrereqs(invoice);
    const nameTrim = sendName.trim();
    const emailTrim = sendEmailDraft.trim();
    if (p?.name && !nameTrim) {
      setSendFormError("Client name is required.");
      return;
    }
    if (p?.email && !emailTrim) {
      setSendFormError("Client email is required.");
      return;
    }
    const body: { customer_name?: string; customer_email?: string } = {};
    if (p?.name) body.customer_name = nameTrim;
    if (p?.email) body.customer_email = emailTrim;
    const ok = await postSendEmail(sendKind, body);
    if (ok) {
      setSendDialogOpen(false);
      setSendFormError(null);
    }
  }

  async function onUploadFile(file: File) {
    setBusy("upload");
    setError(null);
    try {
      const fd = new FormData();
      fd.set("file", file);
      const res = await fetch(`/api/invoices/${invoiceId}/attachments`, {
        method: "POST",
        body: fd,
      });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(j.error ?? "Upload failed");
        return;
      }
      await load();
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function openFile(a: Attachment) {
    const res = await fetch(`/api/invoices/${invoiceId}/attachments/${a.id}?sign=1`);
    const j = (await res.json()) as { url?: string; error?: string };
    if (j.url) window.open(j.url, "_blank", "noopener,noreferrer");
    else if (j.error) setError(j.error);
  }

  async function deleteFile(a: Attachment) {
    if (!confirm(`Remove ${a.file_name}?`)) return;
    setBusy("del");
    setError(null);
    try {
      const res = await fetch(`/api/invoices/${invoiceId}/attachments/${a.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const j = (await res.json()) as { error?: string };
        setError(j.error ?? "Delete failed");
        return;
      }
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function runExtract(a: Attachment) {
    setBusy("extract");
    setError(null);
    try {
      const res = await fetch(`/api/invoices/${invoiceId}/attachments/${a.id}/extract`, {
        method: "POST",
      });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(j.error ?? "Extract failed");
        return;
      }
      await load();
    } finally {
      setBusy(null);
    }
  }

  const subtitle = useMemo(() => {
    if (!invoice) return "";
    const parts: string[] = [];
    if (invoice.customers?.name) parts.push(invoice.customers.name);
    if (invoice.due_date) parts.push(`Due ${invoice.due_date}`);
    return parts.join(" · ");
  }, [invoice]);

  if (loading && !invoice) {
    return (
      <div className="flex w-full flex-col gap-6">
        {backLink()}
        <div className="space-y-3">
          <div className="h-10 w-40 animate-pulse rounded-xl bg-muted/70" />
          <div className="h-28 animate-pulse rounded-2xl bg-muted/50" />
          <div className="h-48 animate-pulse rounded-2xl bg-muted/40" />
        </div>
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="flex w-full flex-col gap-4">
        {backLink()}
        <p className="text-sm font-medium text-destructive">{error ?? "Not found"}</p>
        <Link href="/invoices" className="text-sm font-semibold text-primary hover:underline">
          Back to invoices
        </Link>
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col gap-6">
      {backLink()}

      <div className="relative overflow-hidden rounded-2xl border border-primary/15 bg-gradient-to-br from-primary/[0.08] via-card to-card p-6 shadow-card sm:p-8">
        <div className="absolute -right-8 -top-8 size-40 rounded-full bg-primary/[0.07] blur-2xl" aria-hidden />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-primary/90">Invoice</p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight text-foreground">#{invoice.number}</h1>
            <p className="mt-2 text-sm text-muted-foreground">{subtitle || "No client linked"}</p>
            {invoice.notes ? (
              <p className="mt-3 max-w-prose text-sm leading-relaxed text-foreground/90">{invoice.notes}</p>
            ) : null}
          </div>
          <div className="flex flex-col items-start gap-3 sm:items-end">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Balance</p>
            <p className="text-3xl font-bold tabular-nums tracking-tight text-foreground sm:text-4xl">
              {money(invoice.total_cents, invoice.currency)}
            </p>
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary" className="border-0 bg-card/90 font-semibold capitalize shadow-sm ring-1 ring-border/60">
                {invoice.status}
              </Badge>
              <span
                className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold capitalize ring-1 ${paymentBadge(invoice.payment_status)}`}
              >
                {invoice.payment_status ?? "none"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {error ? (
        <p className="rounded-xl border border-destructive/25 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive">
          {error}
        </p>
      ) : null}

      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader className="border-b border-border/70 pb-4">
            <CardTitle className="text-lg font-bold">Payment & email</CardTitle>
            <CardDescription>
              Share a secure pay link. After checkout, the customer returns here and we mark the invoice paid from the
              session — no Stripe webhook required. This view refreshes when the invoice row updates.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <Button
                type="button"
                variant="secondary"
                className="h-11 gap-2 rounded-xl font-semibold"
                disabled={!!busy || invoice.status === "paid" || invoice.status === "cancelled"}
                onClick={() => void ensurePaymentLink()}
              >
                <LinkIcon className="size-4" />
                {busy === "link" ? "Working…" : "Get pay link"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                className="h-11 gap-2 rounded-xl font-semibold"
                disabled={!!busy || invoice.status === "paid" || invoice.status === "cancelled"}
                onClick={() => void copyLink()}
              >
                <Copy className="size-4" />
                {busy === "copy" ? "Copying…" : "Copy link"}
              </Button>
              <Button
                type="button"
                className="h-11 gap-2 rounded-xl font-semibold shadow-sm"
                disabled={
                  !!busy || emailSendBlocked || invoice.status === "paid" || invoice.status === "cancelled"
                }
                onClick={() => void openSendDialog("invoice_link")}
              >
                <Mail className="size-4" />
                {busy === "email" ? "Sending…" : "Email invoice"}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-11 gap-2 rounded-xl font-semibold"
                disabled={
                  !!busy || emailSendBlocked || invoice.status === "paid" || invoice.status === "cancelled"
                }
                onClick={() => void openSendDialog("reminder")}
              >
                <Clock className="size-4" />
                {busy === "remind" ? "Sending…" : "Send reminder"}
              </Button>
              <Button type="button" variant="ghost" size="sm" className="h-11 gap-1 font-semibold" onClick={() => void load()}>
                <RefreshCw className="size-4" />
                Refresh
              </Button>
            </div>
            {emailSendBlocked ? (
              <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-950 ring-1 ring-amber-500/20">
                Invoice total must be at least $0.50 to email a checkout link.
              </p>
            ) : !invoice.customer_id || !customerEmail ? (
              <p className="rounded-lg bg-primary/[0.06] px-3 py-2 text-xs font-medium leading-relaxed text-foreground ring-1 ring-primary/15">
                No client or email yet? Tap Email invoice — we will ask for what is missing, save the client for you,
                then send.
              </p>
            ) : null}
            {payUrl ? (
              <div className="rounded-xl border border-border bg-muted/30 px-4 py-3 font-mono text-xs leading-relaxed text-muted-foreground break-all">
                {payUrl}
              </div>
            ) : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="border-b border-border/70 pb-4">
            <CardTitle className="text-lg font-bold">Activity</CardTitle>
            <CardDescription>Payments and emails logged for this invoice.</CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            <ul className="space-y-3">
              {timeline.map((t) => (
                <li
                  key={t.id}
                  className="rounded-xl border border-border/70 bg-card px-4 py-3 shadow-sm"
                >
                  <span className="font-semibold text-foreground">{t.label}</span>
                  <div className="mt-1 text-xs text-muted-foreground">{new Date(t.at).toLocaleString()}</div>
                  {t.detail ? <div className="mt-1 text-xs text-foreground/80">{t.detail}</div> : null}
                </li>
              ))}
              {timeline.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">No payment or email events logged yet.</p>
              ) : null}
            </ul>
          </CardContent>
        </Card>
      </div>

      <Dialog open={sendDialogOpen} onOpenChange={setSendDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={(e) => void submitSendDialog(e)}>
            <DialogHeader>
              <DialogTitle>{sendKind === "reminder" ? "Send reminder" : "Email invoice"}</DialogTitle>
              <DialogDescription>
                {invoice
                  ? (() => {
                      const q = sendPrereqs(invoice);
                      if (q?.name && q.email) {
                        return "This invoice has no linked client. Enter who should receive the payment link — we create the client and attach it to this invoice.";
                      }
                      if (q?.email) {
                        return "Add this client’s email so we can send the message from your app.";
                      }
                      return "Add this client’s name so the email greeting is correct.";
                    })()
                  : null}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 px-1 py-2">
              {sendFormError ? (
                <p className="rounded-lg border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">
                  {sendFormError}
                </p>
              ) : null}
              {invoice && sendPrereqs(invoice)?.name ? (
                <div className="space-y-2">
                  <Label htmlFor="send-client-name">Client name</Label>
                  <Input
                    id="send-client-name"
                    className="h-11 rounded-xl"
                    value={sendName}
                    onChange={(e) => setSendName(e.target.value)}
                    autoComplete="name"
                    placeholder="Acme LLC"
                  />
                </div>
              ) : null}
              {invoice && sendPrereqs(invoice)?.email ? (
                <div className="space-y-2">
                  <Label htmlFor="send-client-email">Client email</Label>
                  <Input
                    id="send-client-email"
                    type="email"
                    className="h-11 rounded-xl"
                    value={sendEmailDraft}
                    onChange={(e) => setSendEmailDraft(e.target.value)}
                    autoComplete="email"
                    placeholder="billing@example.com"
                  />
                </div>
              ) : null}
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="ghost"
                disabled={!!busy}
                onClick={() => {
                  setSendDialogOpen(false);
                  setSendFormError(null);
                }}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={!!busy}>
                {busy === "email" || busy === "remind" ? "Sending…" : "Send"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
