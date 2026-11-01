import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Button } from "@/components/ui/button";
import logoUrl from "@/assets/astra-logo.png";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Astra — Sign in" },
      {
        name: "description",
        content:
          "A private AI assistant with chat threads, streaming replies, and a reusable prompt library. Sign in with Google.",
      },
      { property: "og:title", content: "Astra — Your Personal AI Assistant" },
      {
        property: "og:description",
        content:
          "A private AI assistant with chat threads, streaming replies, and a reusable prompt library.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Landing,
});

function Landing() {
  const navigate = useNavigate();
  const [signingIn, setSigningIn] = useState(false);

  // Already signed in (e.g. returning from Google) → straight to the chat.
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) navigate({ to: "/app", replace: true });
    });
  }, [navigate]);

  async function handleGoogleSignIn() {
    setSigningIn(true);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      toast.error("Google sign-in failed. Please try again.");
      setSigningIn(false);
      return;
    }
    if (result.redirected) return; // browser is heading to Google
    // Session was set directly; the effect above picks it up, but be explicit:
    navigate({ to: "/app", replace: true });
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      <div className="flex w-full max-w-sm flex-col items-center text-center">
        <img
          src={logoUrl}
          alt="Astra logo"
          className="size-20 rounded-2xl"
          width={80}
          height={80}
        />
        <h1 className="mt-6 font-display text-4xl font-semibold tracking-tight text-foreground">
          Astra
        </h1>
        <p className="mt-3 text-base leading-relaxed text-muted-foreground">
          Your personal AI assistant — private chats, instant answers, and a
          library of prompts you can reuse.
        </p>
        <Button
          size="lg"
          className="mt-8 w-full gap-2 text-base"
          onClick={handleGoogleSignIn}
          disabled={signingIn}
        >
          {signingIn ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <GoogleIcon />
          )}
          Continue with Google
        </Button>
        <p className="mt-6 text-xs text-muted-foreground">
          Astra is a private, single-user app. Only the owner's Google account
          can sign in.
        </p>
      </div>
    </main>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
      <path
        fill="currentColor"
        d="M21.35 11.1h-9.17v2.73h6.51c-.33 3.81-3.5 5.44-6.5 5.44C8.36 19.27 5 16.25 5 12c0-4.1 3.2-7.27 7.2-7.27 3.09 0 4.9 1.97 4.9 1.97L19 4.72S16.56 2 12.1 2C6.52 2 2.03 6.51 2.03 12c0 5.37 4.25 10 10.1 10 5.11 0 8.86-3.55 8.86-8.75 0-1.52-.42-2.42-.64-2.15Z"
      />
    </svg>
  );
}
