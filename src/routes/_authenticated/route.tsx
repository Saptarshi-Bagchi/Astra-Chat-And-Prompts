import { createFileRoute, redirect } from "@tanstack/react-router";
import { Outlet } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

/**
 * Auth gate for the whole app subtree. Client-only (session lives in
 * browser storage), redirects to the public landing page when signed out.
 * Server functions and /api routes verify the bearer token independently.
 */
export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) {
      throw redirect({ to: "/" });
    }
  },
  component: () => <Outlet />,
});
