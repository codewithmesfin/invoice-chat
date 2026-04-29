"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { friendlySignInError } from "@/lib/auth/supabase-auth-messages";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function readAuthErrorFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const q = new URLSearchParams(window.location.search).get("auth_error");
    if (!q) return null;
    return decodeURIComponent(q);
  } catch {
    return "Something went wrong with the sign-in link. Try signing in with your email and password.";
  }
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fromUrl = readAuthErrorFromUrl();
    if (fromUrl) {
      setError(fromUrl);
      const path = window.location.pathname;
      window.history.replaceState({}, "", path);
    }
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const supabase = createClient();
      const { error: err } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (err) {
        setError(friendlySignInError(err));
        return;
      }
      router.push("/chat");
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
            Sign in
          </CardTitle>
          <p className="text-sm text-slate-600">Welcome back to Invoice Copilot</p>
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
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
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
            <Button type="submit" className="h-11 w-full rounded-lg font-semibold" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="animate-spin" aria-hidden />
                  Signing in…
                </>
              ) : (
                "Continue"
              )}
            </Button>
            <p className="text-center text-sm text-slate-600">
              New here?{" "}
              <Link
                href="/signup"
                className={`font-semibold text-primary hover:underline ${loading ? "pointer-events-none opacity-50" : ""}`}
                tabIndex={loading ? -1 : undefined}
              >
                Create an account
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
