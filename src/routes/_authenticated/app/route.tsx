import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PanelLeftIcon } from "lucide-react";
import { getAppState } from "@/lib/chat.functions";
import { AppSidebar } from "@/components/chat/app-sidebar";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import logoUrl from "@/assets/astra-logo.png";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/app")({
  ssr: false,
  head: () => ({
    meta: [{ title: "Astra — Chat" }],
  }),
  component: AppLayout,
});

const COLLAPSE_KEY = "astra.sidebar.collapsed";

function AppLayout() {
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const appStateQuery = useQuery({
    queryKey: ["app-state"],
    queryFn: () => getAppState(),
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    const stored = window.localStorage.getItem(COLLAPSE_KEY);
    if (stored === "1") setCollapsed(true);
  }, []);

  useEffect(() => {
    window.localStorage.setItem(COLLAPSE_KEY, collapsed ? "1" : "0");
  }, [collapsed]);

  if (appStateQuery.isPending) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Spinner className="size-6 text-primary" />
      </div>
    );
  }

  if (!appStateQuery.data?.access) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-background px-4 text-center">
        <img src={logoUrl} alt="" className="size-14 opacity-40" width={56} height={56} />
        <h1 className="font-display text-xl font-semibold text-foreground">
          This is a private assistant
        </h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          You signed in with{" "}
          <span className="font-medium text-foreground">
            {appStateQuery.data?.email ?? "an account"}
          </span>
          , but Astra is reserved for its owner's account only.
        </p>
        <Button
          variant="outline"
          onClick={async () => {
            await supabase.auth.signOut();
            navigate({ to: "/", replace: true });
          }}
        >
          Sign out
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <AppSidebar
        collapsed={collapsed}
        onToggle={() => setCollapsed((c) => !c)}
        email={appStateQuery.data.email}
      />
      <main className="flex min-w-0 flex-1 flex-col">
        <Outlet />
      </main>
    </div>
  );
}

export function SidebarToggleButton({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="ghost" size="icon" onClick={onClick} aria-label="Toggle sidebar">
      <PanelLeftIcon className="size-4" />
    </Button>
  );
}
