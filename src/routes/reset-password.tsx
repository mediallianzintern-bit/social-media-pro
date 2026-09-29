import { useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";

import { AuthCard, FormMessage } from "@/components/auth/auth-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { ALLOWED_EMAIL_DOMAIN, isAllowedEmail } from "@/lib/auth";

/** Supabase's own floor is six; this is the rule the sign-up form applies. */
const MIN_PASSWORD_LENGTH = 8;

export const Route = createFileRoute("/reset-password")({
  // Must not redirect a signed-in visitor away, unlike /login: following the
  // emailed link IS what signs them in, and they arrive here holding a
  // recovery session precisely so they can set a new password.
  ssr: false,
  component: ResetPasswordPage,
});

type LinkState = "checking" | "ready" | "invalid";

function ResetPasswordPage() {
  useEffect(() => {
    document.title = "Choose a new password — Social Command Center";
  }, []);

  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [linkState, setLinkState] = useState<LinkState>("checking");
  const [linkError, setLinkError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Is this a real recovery link?
  //
  // The client is configured to detect a session in the URL, so following the
  // emailed link exchanges its token for a session as the page loads. That is
  // asynchronous and can land either side of this effect, so both routes to
  // the answer are covered: the event, and a direct read for the case where
  // the exchange already finished before we subscribed.
  useEffect(() => {
    let settled = false;

    // Supabase reports a dead link in the URL fragment rather than by throwing.
    const fragment = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const urlError = fragment.get("error_description") ?? fragment.get("error");
    if (urlError) {
      setLinkError(urlError.replace(/\+/g, " "));
      setLinkState("invalid");
      return;
    }

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      if (settled || !session) return;
      settled = true;
      setLinkState("ready");
    });

    void supabase.auth.getSession().then(({ data }) => {
      if (settled) return;
      settled = true;
      setLinkState(data.session ? "ready" : "invalid");
    });

    return () => subscription.subscription.unsubscribe();
  }, []);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Use at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (password !== confirm) {
      setError("Both passwords must match.");
      return;
    }

    setPending(true);
    const { data, error: updateError } = await supabase.auth.updateUser({ password });
    setPending(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    // The same check the login form makes. A recovery session for another
    // domain could only come from an account created before the rule existed,
    // and it is dropped here rather than left holding a usable dashboard.
    if (!isAllowedEmail(data.user?.email)) {
      await supabase.auth.signOut();
      setError(`Only @${ALLOWED_EMAIL_DOMAIN} accounts can use this dashboard.`);
      return;
    }

    // Updating the password leaves the recovery session signed in, so there is
    // nothing more to do but go in.
    queryClient.clear();
    await navigate({ href: "/" });
  }

  if (linkState === "checking") {
    return (
      <AuthCard title="Choose a new password" description="Checking your link…">
        <div className="flex items-center justify-center py-6 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" aria-hidden />
        </div>
      </AuthCard>
    );
  }

  if (linkState === "invalid") {
    return (
      <AuthCard
        title="This link has expired"
        description="Reset links can only be used once, and last an hour."
        footer={
          <Link
            to="/login"
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            Back to sign in
          </Link>
        }
      >
        <div className="space-y-4">
          {linkError ? <FormMessage tone="error">{linkError}</FormMessage> : null}
          <Button asChild className="w-full">
            <Link to="/forgot-password">Send a new link</Link>
          </Button>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Choose a new password"
      description="You will be signed in once it is saved."
      footer={
        <Link
          to="/login"
          className="font-medium text-foreground underline-offset-4 hover:underline"
        >
          Back to sign in
        </Link>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <div className="space-y-2">
          <Label htmlFor="password">New password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            autoFocus
          />
          <p className="text-xs text-muted-foreground">
            At least {MIN_PASSWORD_LENGTH} characters.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirm">Confirm new password</Label>
          <Input
            id="confirm"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            required
          />
        </div>

        {error ? <FormMessage tone="error">{error}</FormMessage> : null}

        <Button type="submit" className="w-full" disabled={pending || !password || !confirm}>
          {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          {pending ? "Saving…" : "Save password"}
        </Button>
      </form>
    </AuthCard>
  );
}
