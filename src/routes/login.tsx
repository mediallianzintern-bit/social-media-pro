import { useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { z } from "zod";

import { AuthCard, FormMessage } from "@/components/auth/auth-card";
import { GoTo } from "@/components/auth/go-to";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { ALLOWED_EMAIL_DOMAIN, isAllowedEmail, safeRedirect } from "@/lib/auth";
import { currentStaffEmail } from "@/lib/session";

export const Route = createFileRoute("/login")({
  ssr: false,
  validateSearch: z.object({ redirect: z.string().optional() }),
  // Already signed in — including arriving from the email-confirmation link,
  // which the Supabase client turns into a session on load — goes straight on.
  beforeLoad: async () => ({ signedInAs: await currentStaffEmail() }),
  component: LoginGate,
});

function LoginGate() {
  const { signedInAs } = Route.useRouteContext();
  const search = Route.useSearch();
  if (signedInAs) return <GoTo href={safeRedirect(search.redirect)} />;
  return <LoginPage />;
}

function LoginPage() {
  // Set after mount, not through the route's head(): a signed-out visitor is
  // redirected here from a protected page while the page is still hydrating,
  // and a head() title would then differ from the one the server sent,
  // tripping a hydration mismatch on every such visit.
  useEffect(() => {
    document.title = "Sign in — Social Command Center";
  }, []);
  const search = Route.useSearch();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [unconfirmed, setUnconfirmed] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setUnconfirmed(false);

    const address = email.trim().toLowerCase();
    if (!isAllowedEmail(address)) {
      setError(`Use your @${ALLOWED_EMAIL_DOMAIN} work email.`);
      return;
    }

    setPending(true);
    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email: address,
      password,
    });
    setPending(false);

    if (signInError) {
      if (/not confirmed/i.test(signInError.message)) {
        setUnconfirmed(true);
        setError("Confirm your email first — open the link we sent to your inbox.");
      } else if (/invalid login credentials/i.test(signInError.message)) {
        setError("Wrong email or password.");
      } else {
        setError(signInError.message);
      }
      return;
    }

    // The server re-checks the domain on every request; this keeps a wrong
    // session from being held in the browser at all.
    if (!isAllowedEmail(data.user?.email)) {
      await supabase.auth.signOut();
      setError(`Only @${ALLOWED_EMAIL_DOMAIN} accounts can sign in.`);
      return;
    }

    queryClient.clear();
    await navigate({ href: safeRedirect(search.redirect) });
  }

  async function resendConfirmation() {
    setError(null);
    const { error: resendError } = await supabase.auth.resend({
      type: "signup",
      email: email.trim().toLowerCase(),
      options: { emailRedirectTo: `${window.location.origin}/login` },
    });
    if (resendError) setError(resendError.message);
    else setNotice("Confirmation email sent again — check your inbox and spam folder.");
  }

  return (
    <AuthCard
      title="Sign in"
      description="Use your Mediallianz work account."
      footer={
        <>
          New to the team?{" "}
          <Link
            to="/signup"
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <div className="space-y-2">
          <Label htmlFor="email">Work email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder={`you@${ALLOWED_EMAIL_DOMAIN}`}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            autoFocus
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </div>

        {error ? <FormMessage tone="error">{error}</FormMessage> : null}
        {notice ? <FormMessage tone="info">{notice}</FormMessage> : null}

        <Button type="submit" className="w-full" disabled={pending || !email || !password}>
          {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          {pending ? "Signing in…" : "Sign in"}
        </Button>

        {unconfirmed ? (
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => void resendConfirmation()}
          >
            Resend confirmation email
          </Button>
        ) : null}
      </form>
    </AuthCard>
  );
}
