// Server-side gate on EVERY server function: a valid Supabase session whose
// email is @mediallianz.com.
//
// Registered globally in src/start.ts. Page guards only decide what the browser
// shows; this is what actually stops a request. Without it, anyone could call
// the dashboard's server functions directly — reading client data, starting a
// paid sync, or running a paid AI generation — whatever the screens show.
import { createMiddleware } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isAllowedEmail } from "@/lib/auth";

export const requireStaff = createMiddleware({ type: "function" })
  .middleware([requireSupabaseAuth])
  .server(async ({ next, context }) => {
    // The email comes from the verified token, not from anything the caller
    // sent, so it cannot be spoofed by editing a request.
    const email = typeof context.claims["email"] === "string" ? context.claims["email"] : "";
    if (!isAllowedEmail(email)) {
      throw new Error("Forbidden: only @mediallianz.com accounts can use this dashboard.");
    }
    return next({ context: { staffEmail: email } });
  });
