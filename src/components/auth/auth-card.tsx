import type { ReactNode } from "react";

import { Wordmark } from "@/components/brand";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ALLOWED_EMAIL_DOMAIN } from "@/lib/auth";

/** The frame both auth screens share, so login and sign-up read as one place. */
export function AuthCard({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4 py-10">
      <div className="w-full max-w-sm space-y-6">
        {/* The lockup rather than the mark: this is the first screen anyone
            signing in sees, and it is the one place the company should be named
            outright. The product name moves below it, so the two are not
            competing for the same line. */}
        <div className="flex flex-col items-center gap-2">
          <Wordmark className="h-8" />
          <p className="text-sm font-medium text-muted-foreground">Social Command Center</p>
        </div>

        <Card>
          <CardHeader className="space-y-1.5">
            <CardTitle className="text-xl">{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </CardHeader>
          <CardContent>{children}</CardContent>
        </Card>

        {footer ? <div className="text-center text-sm text-muted-foreground">{footer}</div> : null}

        <p className="text-center text-xs text-muted-foreground">
          Only @{ALLOWED_EMAIL_DOMAIN} accounts can access this dashboard.
        </p>
      </div>
    </div>
  );
}

/** One line of feedback under a form — an error, or a neutral notice. */
export function FormMessage({ tone, children }: { tone: "error" | "info"; children: ReactNode }) {
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={
        tone === "error"
          ? "rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
          : "rounded-md border bg-muted/50 px-3 py-2 text-sm text-foreground"
      }
    >
      {children}
    </p>
  );
}
