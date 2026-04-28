"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
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
      const supabase = createClient();
      const { error: err } = await supabase.auth.signUp({ email, password });
      if (err) {
        setError(err.message);
        return;
      }
      setInfo("Check your email to confirm, or sign in if confirmations are off.");
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
          <form onSubmit={onSubmit} className="space-y-4">
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
              />
            </div>
            {error ? <p className="text-sm text-red-600">{error}</p> : null}
            {info ? <p className="text-sm text-slate-600">{info}</p> : null}
            <Button type="submit" className="h-11 w-full rounded-lg font-semibold" disabled={loading}>
              {loading ? "Creating…" : "Create account"}
            </Button>
            <p className="text-center text-sm text-slate-600">
              Already have an account?{" "}
              <Link href="/login" className="font-semibold text-primary hover:underline">
                Sign in
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
