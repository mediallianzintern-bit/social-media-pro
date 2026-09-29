import { Link, createFileRoute } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";

import { AuthCard, FormMessage } from "@/components/auth/auth-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { ALLOWED_EMAIL_DOMAIN, isAllowedEmail } from "@/lib/auth";

export const Route = createFileRoute("/forgot-password")({
  // The Supabase session lives in the browser, as on every other auth screen.
  ssr: false,
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  // Set after mount rather than through head(), for the same reason as the
  // login page: a signed-out visitor can land here mid-hydration.
  useEffect(() => {
    document.title = "Reset your password — Social Command Center";
  }, []);

  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    const address = email.trim().toLowerCase();
    if (!isAllowedEmail(address)) {
      setError(`Use your @${ALLOWED_EMAIL_DOMAIN} work email.`);
      return;
    }

    setPending(true);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(address, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setPending(false);

    // Deliberately NOT branched on whether the address has an account.
    //
    // Supabase returns success either way, and this keeps it that way: a form
    // that says "no such user" lets anyone test which colleagues are
    // registered. The only errors surfaced are ones about the request itself,
    // such as sending too many in a row.
    if (resetError) {
      setError(resetError.message);
      return;
    }
    setSent(true);
  }

  return (
    <AuthCard
      title="Reset your password"
      description={sent ? "Check your inbox." : "We will email you a link to choose a new one."}
      footer={
        <>
          Remembered it?{" "}
          <Link
            to="/login"
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            Back to sign in
          </Link>
        </>
      }
    >
      {sent ? (
        <div className="space-y-4">
          <FormMessage tone="info">
            If an account exists for <span className="font-medium">{email.trim()}</span>, a reset
            link is on its way. It expires in an hour — check your spam folder if it has not
            arrived.
          </FormMessage>
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => {
              setSent(false);
              setError(null);
            }}
          >
            Use a different email
          </Button>
        </div>
      ) : (
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

          {error ? <FormMessage tone="error">{error}</FormMessage> : null}

          <Button type="submit" className="w-full" disabled={pending || !email}>
            {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            {pending ? "Sending…" : "Send reset link"}
          </Button>
        </form>
      )}
    </AuthCard>
  );
}
