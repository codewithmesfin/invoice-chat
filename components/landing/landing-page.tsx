import Link from "next/link";
import { ArrowRight, Brain, Shield, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";

export function LandingPage() {
  return (
    <div className="relative min-h-dvh bg-[hsl(var(--landing))] text-slate-900">
      <div
        aria-hidden
        className="pointer-events-none absolute right-0 top-0 h-[420px] w-[420px] translate-x-1/4 -translate-y-1/4 rounded-full bg-gradient-to-br from-sky-100/90 to-indigo-100/50 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-0 left-0 h-80 w-80 -translate-x-1/3 translate-y-1/4 rounded-full bg-gradient-to-tr from-blue-50 to-transparent blur-3xl"
      />

      <header className="relative z-10 mx-auto flex max-w-5xl items-center justify-between border-b border-slate-200/80 bg-white/60 px-4 py-4 backdrop-blur-md sm:px-6">
        <span className="text-lg font-semibold tracking-tight text-slate-900">Invoice Copilot</span>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="text-slate-600 hover:bg-slate-100" asChild>
            <Link href="/login">Sign in</Link>
          </Button>
          <Button size="sm" className="rounded-full px-5 shadow-sm" asChild>
            <Link href="/signup">Start free</Link>
          </Button>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-5xl px-4 pb-24 pt-10 sm:px-6 sm:pb-28 sm:pt-14">
        <p className="mb-4 inline-flex rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 shadow-sm">
          Simple · Mobile-first · Copilot-style
        </p>
        <h1 className="max-w-3xl text-[2.1rem] font-semibold leading-[1.08] tracking-tight text-slate-900 sm:text-5xl sm:leading-[1.05]">
          Invoicing that feels as easy as chatting with Copilot.
        </h1>
        <p className="mt-5 max-w-xl text-base leading-relaxed text-slate-600 sm:text-lg">
          One app for clients, invoices, and answers. Your AI plans steps, pulls real numbers, and
          keeps context — so you spend less time in spreadsheets.
        </p>

        <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
          <Button
            size="lg"
            className="h-12 rounded-full px-8 text-base font-semibold shadow-md shadow-primary/20"
            asChild
          >
            <Link href="/signup" className="inline-flex items-center gap-2">
              Create free account
              <ArrowRight className="size-5" />
            </Link>
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="h-12 rounded-full border-slate-300 bg-white px-8 text-base font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
            asChild
          >
            <Link href="/login">I have an account</Link>
          </Button>
        </div>

        <ul className="mt-16 grid gap-4 sm:grid-cols-3">
          {[
            {
              icon: Brain,
              title: "Plans & acts",
              body: "Real tools on your data — not vague AI prose.",
            },
            {
              icon: Zap,
              title: "Built for one hand",
              body: "Bottom navigation and a clean composer, tuned for phones first.",
            },
            {
              icon: Shield,
              title: "Your workspace",
              body: "Supabase with row-level security. You control the project.",
            },
          ].map(({ icon: Icon, title, body }) => (
            <li
              key={title}
              className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-sm transition hover:shadow-md"
            >
              <div className="mb-4 flex size-11 items-center justify-center rounded-xl bg-sky-50 text-primary">
                <Icon className="size-6" strokeWidth={1.6} />
              </div>
              <h2 className="font-semibold text-slate-900">{title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{body}</p>
            </li>
          ))}
        </ul>

        <section className="mt-20 rounded-3xl border border-slate-200 bg-gradient-to-b from-white to-slate-50/80 px-6 py-12 text-center shadow-sm sm:px-12">
          <h2 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
            Start in under a minute
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-slate-600">
            No card required to explore. Light, fast, and focused on what owners actually do every
            week.
          </p>
          <Button size="lg" className="mt-8 rounded-full px-10 font-semibold shadow-md" asChild>
            <Link href="/signup">Get started free</Link>
          </Button>
        </section>
      </main>

      <footer className="relative z-10 border-t border-slate-200/80 bg-white/70 px-4 py-6 text-center text-xs text-slate-500 backdrop-blur-sm sm:px-6">
        © {new Date().getFullYear()} Invoice Copilot ·{" "}
        <Link href="/login" className="font-medium text-primary underline-offset-2 hover:underline">
          Sign in
        </Link>
      </footer>
    </div>
  );
}
