import { useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { Loader2, MailCheck } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";

import { AuthCard, FormMessage } from "@/components/auth/auth-card";
import { GoTo } from "@/components/auth/go-to";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { ALLOWED_EMAIL_DOMAIN, isAllowedEmail } from "@/lib/auth";
import { currentStaffEmail } from "@/lib/session";

/** Long enough to resist guessing; Supabase applies its own minimum on top. */
const MIN_PASSWORD = 8;

export const Route = createFileRoute("/signup")({
  ssr: false,
  beforeLoad: async () => ({ signedInAs: await currentStaffEmail() }),
  component: SignupGate,
});

function SignupGate() {
  const { signedInAs } = Route.useRouteContext();
  if (signedInAs) return <GoTo href="/" />;
  return <SignupPage />;
}

function SignupPage() {
  // Set after mount, not through the route's head(): a signed-out visitor is
  // redirected here from a protected page while the page is still hydrating,
  // and a head() title would then differ from the one the server sent,
  // tripping a hydration mismatch on every such visit.
  useEffect(() => {
    document.title = "Create account — Social Command Center";
  }, []);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [resent, setResent] = useState(false);

  // Shown as the person types, so a wrong domain is caught before they fill in
  // a password rather than after.
  const address = email.trim().toLowerCase();
  const wrongDomain = address.includes("@") && !isAllowedEmail(address);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (!isAllowedEmail(address)) {
      setError(`Only @${ALLOWED_EMAIL_DOMAIN} email addresses can sign up.`);
      return;
    }
    if (password.length < MIN_PASSWORD) {
      setError(`Use at least ${MIN_PASSWORD} characters for the password.`);
      return;
    }
    if (password !== confirm) {
      setError("The two passwords don't match.");
      return;
    }

    setPending(true);
    const { data, error: signUpError } = await supabase.auth.signUp({
      email: address,
      password,
      // Where the confirmation link lands. This URL must be listed under
      // Supabase → Authentication → URL Configuration → Redirect URLs.
      options: { emailRedirectTo: `${window.location.origin}/login` },
    });
    setPending(false);

    if (signUpError) {
      // The database refuses any other domain (migration 0011) and Supabase
      // reports that as a generic save error; say what actually happened.
      if (/database error saving new user/i.test(signUpError.message)) {
        setError(`Only @${ALLOWED_EMAIL_DOMAIN} email addresses can sign up.`);
      } else if (/already registered/i.test(signUpError.message)) {
        setError("An account with this email already exists — sign in instead.");
      } else {
        setError(signUpError.message);
      }
      return;
    }

    // Supabase answers a repeat sign-up for an existing address with a user
    // that has no identities, instead of an error, so it cannot be used to
    // probe which emails exist. Treat it as "already registered".
    if (data.user && data.user.identities?.length === 0) {
      setError("An account with this email already exists — sign in instead.");
      return;
    }

    // Email confirmation is required on this project, so there is normally no
    // session yet. If it were ever switched off, go straight in.
    if (data.session) {
      queryClient.clear();
      await navigate({ to: "/" });
      return;
    }
    setSentTo(address);
  }

  async function resend() {
    if (!sentTo) return;
    const { error: resendError } = await supabase.auth.resend({
      type: "signup",
      email: sentTo,
      options: { emailRedirectTo: `${window.location.origin}/login` },
    });
    if (resendError) setError(resendError.message);
    else setResent(true);
  }

  if (sentTo) {
    return (
      <AuthCard
        title="Check your inbox"
        description="One more step before you can sign in."
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
          <div className="flex items-start gap-3 rounded-md border bg-muted/40 p-3 text-sm">
            <MailCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
            <p>
              We sent a confirmation link to <span className="font-medium">{sentTo}</span>. Open it
              to activate your account, then sign in.
            </p>
          </div>
          {error ? <FormMessage tone="error">{error}</FormMessage> : null}
          {resent ? <FormMessage tone="info">Sent again — check spam too.</FormMessage> : null}
          <Button
            variant="outline"
            className="w-full"
            onClick={() => void resend()}
            disabled={resent}
          >
            Resend confirmation email
          </Button>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Create an account"
      description={`For the Mediallianz team — use your @${ALLOWED_EMAIL_DOMAIN} address.`}
      footer={
        <>
          Already have an account?{" "}
          <Link
            to="/login"
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            Sign in
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
            aria-invalid={wrongDomain || undefined}
            required
            autoFocus
          />
          {wrongDomain ? (
            <p className="text-xs text-destructive">
              Only @{ALLOWED_EMAIL_DOMAIN} addresses can sign up.
            </p>
          ) : null}
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
          <p className="text-xs text-muted-foreground">At least {MIN_PASSWORD} characters.</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirm">Confirm password</Label>
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

        <Button
          type="submit"
          className="w-full"
          disabled={pending || wrongDomain || !email || !password || !confirm}
        >
          {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          {pending ? "Creating account…" : "Create account"}
        </Button>
      </form>
    </AuthCard>
  );
}
