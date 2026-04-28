import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BottomNav } from "@/components/layout/bottom-nav";
import { DesktopAppRail } from "@/components/layout/desktop-app-rail";

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return (
    <>
      <div className="flex h-dvh max-h-dvh min-h-0 flex-row overflow-hidden bg-background app-page-gradient supports-[height:100dvh]:h-[100dvh] supports-[height:100dvh]:max-h-[100dvh]">
        <DesktopAppRail />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <main
            className="relative z-0 flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-y-contain pb-[calc(3.5rem+env(safe-area-inset-bottom,0px))] sm:pb-[calc(4rem+env(safe-area-inset-bottom,0px))] lg:pb-0"
            id="app-main"
          >
            {children}
          </main>
        </div>
      </div>
      <BottomNav />
    </>
  );
}
