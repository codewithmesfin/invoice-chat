"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

function safeNext(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/chat";
  return value;
}

export default function AuthCallbackPage() {
  const router = useRouter();
  const [hint, setHint] = useState("Signing you in…");

  useEffect(() => {
    const run = async () => {
      const supabase = createClient();
      const u = new URL(window.location.href);
      const err = u.searchParams.get("error");
      const errDesc = u.searchParams.get("error_description");

      if (err) {
        const msg = (errDesc || err).replace(/\+/g, " ");
        router.replace(`/login?auth_error=${encodeURIComponent(msg)}`);
        return;
      }

      const next = safeNext(u.searchParams.get("next"));
      const code = u.searchParams.get("code");

      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          router.replace(`/login?auth_error=${encodeURIComponent(error.message)}`);
          return;
        }
        router.replace(next);
        return;
      }

      // Implicit flow: tokens live in the hash (never sent to a Route Handler).
      const hash = u.hash.replace(/^#/, "");
      if (hash) {
        const hp = new URLSearchParams(hash);
        const access = hp.get("access_token");
        const refresh = hp.get("refresh_token");
        const hErr = hp.get("error");
        if (hErr) {
          router.replace(
            `/login?auth_error=${encodeURIComponent(hp.get("error_description") || hErr)}`
          );
          return;
        }
        if (access && refresh) {
          const { error } = await supabase.auth.setSession({
            access_token: access,
            refresh_token: refresh,
          });
          if (error) {
            router.replace(`/login?auth_error=${encodeURIComponent(error.message)}`);
            return;
          }
          window.history.replaceState({}, "", u.pathname + u.search);
          router.replace(next);
          return;
        }
      }

      const {
        data: { session },
        error: sessionErr,
      } = await supabase.auth.getSession();
      if (sessionErr) {
        router.replace(`/login?auth_error=${encodeURIComponent(sessionErr.message)}`);
        return;
      }
      if (session) {
        window.history.replaceState({}, "", u.pathname + u.search);
        router.replace(next);
        return;
      }

      router.replace(
        `/login?auth_error=${encodeURIComponent(
          "That link is incomplete or expired. Try signing in again. If the URL shows localhost in production, set Supabase Auth Site URL to your live https origin and allow /auth/callback in Redirect URLs (see .env.example)."
        )}`
      );
    };

    void run();
  }, [router]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-[hsl(var(--landing))] px-4 text-slate-700">
      <Loader2 className="size-8 animate-spin text-primary" aria-hidden />
      <p className="text-sm font-medium">{hint}</p>
    </div>
  );
}
