"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { friendlySignUpError } from "@/lib/auth/supabase-auth-messages";
import { parseJsonSafe, type ApiErrorBody } from "@/lib/http/api-user-message";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const raw = await parseJsonSafe(res);
      const body = (raw ?? {}) as { ok?: boolean; message?: string; error?: string } & ApiErrorBody;
      if (!res.ok) {
        const msg =
          typeof body.message === "string" && body.message.trim()
            ? body.message
            : typeof body.error === "string"
              ? body.error
              : "Sign up failed.";
        setError(friendlySignUpError({ message: msg, status: res.status }));
        return;
      }
      setInfo(
        "Check your inbox for a confirmation link. After you confirm, you can sign in. If email confirmation is turned off for this project, you can sign in right away."
      );
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-[hsl(var(--landing))] px-4 py-10">
      <Link
        href="/"
        className="absolute left-4 top-4 text-sm font-medium text-slate-600 hover:text-slate-900 sm:left-6 sm:top-6"
      >
        ← Home
      </Link>
      <Card className="w-full max-w-md border-slate-200/90 shadow-xl shadow-slate-900/5">
        <CardHeader className="space-y-1 pb-2">
          <CardTitle className="text-2xl font-semibold tracking-tight text-slate-900">
            Create account
          </CardTitle>
          <p className="text-sm text-slate-600">Free to start · takes about a minute</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4" aria-busy={loading}>
            <div className="space-y-2">
              <Label htmlFor="email" className="text-slate-700">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-slate-700">
                Password
              </Label>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                disabled={loading}
              />
            </div>
            {error ? (
              <div
                role="alert"
                className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
              >
                {error}
              </div>
            ) : null}
            {info ? (
              <div
                role="status"
                className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800"
              >
                {info}
              </div>
            ) : null}
            <Button type="submit" className="h-11 w-full rounded-lg font-semibold" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="animate-spin" aria-hidden />
                  Creating account…
                </>
              ) : (
                "Create account"
              )}
            </Button>
            <p className="text-center text-sm text-slate-600">
              Already have an account?{" "}
              <Link
                href="/login"
                className={`font-semibold text-primary hover:underline ${loading ? "pointer-events-none opacity-50" : ""}`}
                tabIndex={loading ? -1 : undefined}
              >
                Sign in
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
