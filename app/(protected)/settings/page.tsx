import { Mail, Shield } from "lucide-react";
import { signOutAction } from "@/app/actions/auth";
import { createClient } from "@/lib/supabase/server";
import { PageContainer, PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const email = user?.email ?? "Signed in";

  return (
    <PageContainer narrow>
      <PageHeader
        eyebrow="Account"
        title="Profile"
        description="Manage your session and see how you are signed in. Business data stays in your workspace."
      />

      <div className="flex flex-col gap-5">
        <Card>
          <CardHeader className="border-b border-border/60 pb-4">
            <div className="flex items-start gap-4">
              <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/15">
                <Mail className="size-6" strokeWidth={1.75} aria-hidden />
              </div>
              <div className="min-w-0 space-y-1">
                <CardTitle className="text-lg font-bold tracking-tight">Sign-in email</CardTitle>
                <CardDescription className="text-pretty text-sm leading-relaxed">
                  Used for authentication. Invoice emails to clients use addresses stored on each client record.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-5">
            <p className="break-all text-sm font-semibold text-foreground">{email}</p>
          </CardContent>
        </Card>

        <Card className="border-destructive/15">
          <CardHeader className="border-b border-border/60 pb-4">
            <div className="flex items-start gap-4">
              <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-muted text-muted-foreground ring-1 ring-border">
                <Shield className="size-6" strokeWidth={1.75} aria-hidden />
              </div>
              <div className="min-w-0 space-y-1">
                <CardTitle className="text-lg font-bold tracking-tight">Session</CardTitle>
                <CardDescription className="text-pretty text-sm leading-relaxed">
                  Sign out on this device when you are done or on a shared computer.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-5">
            <form action={signOutAction}>
              <Button type="submit" variant="destructive" className="h-11 w-full rounded-xl font-semibold shadow-sm">
                Sign out
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}
