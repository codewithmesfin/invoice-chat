"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Mail, Trash2, Upload } from "lucide-react";
import { friendlyUserMessage, parseJsonSafe, type ApiErrorBody } from "@/lib/http/api-user-message";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";

type Customer = {
  id: string;
  name: string;
  email: string | null;
  notes: string | null;
};

type Attachment = {
  id: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  created_at: string;
  extracted_text: string | null;
};

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function backLink() {
  return (
    <Link
      href="/customers"
      className="inline-flex items-center gap-2 rounded-full border border-border/80 bg-card px-3 py-1.5 text-sm font-semibold text-muted-foreground shadow-sm transition-colors hover:border-primary/30 hover:text-foreground"
    >
      <ArrowLeft className="size-4" aria-hidden />
      All clients
    </Link>
  );
}

export function CustomerDetailClient({ customerId }: { customerId: string }) {
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setError(null);
    const [cRes, aRes] = await Promise.all([
      fetch(`/api/customers/${customerId}`),
      fetch(`/api/customers/${customerId}/attachments`),
    ]);
    const cRaw = await parseJsonSafe(cRes);
    const cJson = (cRaw ?? {}) as { customer?: Customer } & ApiErrorBody;
    if (!cRes.ok) {
      setError(friendlyUserMessage(cRes.status, cJson, "Couldn’t load this client."));
      setLoading(false);
      return;
    }
    setCustomer(cJson.customer ?? null);
    if (!cJson.customer) {
      setError(friendlyUserMessage(404, cJson, "This client isn’t available."));
      setLoading(false);
      return;
    }
    if (aRes.ok) {
      const aRaw = await parseJsonSafe(aRes);
      const aJson = (aRaw ?? {}) as { attachments?: Attachment[] };
      setAttachments(aJson.attachments ?? []);
    }
    setLoading(false);
  }, [customerId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onUploadFile(file: File) {
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("file", file);
      const res = await fetch(`/api/customers/${customerId}/attachments`, {
        method: "POST",
        body: fd,
      });
      const raw = await parseJsonSafe(res);
      const j = (raw ?? {}) as ApiErrorBody;
      if (!res.ok) {
        setError(friendlyUserMessage(res.status, j, "Upload didn’t go through. Try again."));
        return;
      }
      await load();
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function openFile(a: Attachment) {
    const res = await fetch(`/api/customers/${customerId}/attachments/${a.id}?sign=1`);
    const raw = await parseJsonSafe(res);
    const j = (raw ?? {}) as { url?: string } & ApiErrorBody;
    if (j.url) window.open(j.url, "_blank", "noopener,noreferrer");
    else setError(friendlyUserMessage(res.status, j, "Couldn’t open that file."));
  }

  async function deleteFile(a: Attachment) {
    if (!confirm(`Remove ${a.file_name}?`)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/customers/${customerId}/attachments/${a.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const raw = await parseJsonSafe(res);
        const j = (raw ?? {}) as ApiErrorBody;
        setError(friendlyUserMessage(res.status, j, "Couldn’t remove that file."));
        return;
      }
      await load();
    } finally {
      setBusy(false);
    }
  }

  if (loading && !customer) {
    return (
      <div className="flex w-full flex-col gap-6">
        {backLink()}
        <div className="flex gap-4">
          <div className="size-20 animate-pulse rounded-2xl bg-muted/60" />
          <div className="flex-1 space-y-2 pt-2">
            <div className="h-6 w-48 animate-pulse rounded-lg bg-muted/60" />
            <div className="h-4 w-full max-w-xs animate-pulse rounded-lg bg-muted/40" />
          </div>
        </div>
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="flex w-full flex-col gap-4">
        {backLink()}
        <p className="text-sm font-medium text-destructive">{error ?? "Not found"}</p>
        <Link href="/customers" className="text-sm font-semibold text-primary hover:underline">
          Back to clients
        </Link>
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col gap-6">
      {backLink()}

      <div className="relative overflow-hidden rounded-2xl border border-border/80 bg-card p-6 shadow-card sm:p-8">
        <div className="absolute -right-6 top-0 size-32 rounded-full bg-primary/[0.06] blur-2xl" aria-hidden />
        <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center sm:gap-8">
          <div className="flex size-20 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 text-2xl font-bold text-primary ring-2 ring-primary/15 sm:size-24 sm:text-3xl">
            {initials(customer.name)}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">{customer.name}</h1>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-muted/80 px-3 py-1 font-medium text-foreground ring-1 ring-border/60">
                <Mail className="size-3.5 shrink-0 text-primary" aria-hidden />
                {customer.email ?? "No email on file"}
              </span>
            </div>
            {customer.notes ? (
              <p className="mt-4 max-w-prose text-sm leading-relaxed text-muted-foreground">{customer.notes}</p>
            ) : (
              <p className="mt-4 text-sm italic text-muted-foreground">No notes on this client.</p>
            )}
          </div>
        </div>
      </div>

      {error ? (
        <p className="rounded-xl border border-destructive/25 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive">
          {error}
        </p>
      ) : null}

      <Card>
        <CardHeader className="border-b border-border/70 pb-4">
          <CardTitle className="text-lg font-bold">Files</CardTitle>
          <CardDescription>Private storage for receipts and documents linked to this client.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5 pt-6">
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,image/*,.txt,text/plain"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onUploadFile(f);
            }}
          />
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="space-y-1.5">
              <Label className="text-foreground">Upload</Label>
              <p className="text-xs text-muted-foreground">Same limits as invoice attachments.</p>
            </div>
            <Button
              type="button"
              variant="secondary"
              className="h-11 gap-2 rounded-xl font-semibold"
              disabled={busy}
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="size-4" />
              {busy ? "Uploading…" : "Choose file"}
            </Button>
          </div>
          <ul className="space-y-3">
            {attachments.map((a) => (
              <li
                key={a.id}
                className="flex flex-col gap-3 rounded-2xl border border-border/80 bg-muted/20 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="font-semibold text-foreground">{a.file_name}</div>
                  <div className="text-xs text-muted-foreground">
                    {(a.size_bytes / 1024).toFixed(1)} KB · {new Date(a.created_at).toLocaleString()}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button type="button" size="sm" variant="secondary" className="rounded-lg font-semibold" onClick={() => void openFile(a)}>
                    Open
                  </Button>
                  <Button type="button" size="sm" variant="ghost" className="rounded-lg" onClick={() => void deleteFile(a)}>
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                </div>
              </li>
            ))}
            {attachments.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No files yet.</p>
            ) : null}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
