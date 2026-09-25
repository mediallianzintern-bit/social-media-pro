// The browser half of the login gate: who is signed in, and where to send them
// if nobody is.
//
// Used by route `beforeLoad` hooks, which pass the answer to the component; the
// component moves the visitor with <GoTo> after hydration (see go-to.tsx for
// why not a thrown redirect). This decides what the browser SHOWS; it protects
// no data — that is require-staff.ts, on the server.
import { supabase } from "@/integrations/supabase/client";
import { isAllowedEmail } from "@/lib/auth";

export async function currentStaffEmail(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  const email = data.session?.user.email ?? null;
  if (data.session && !isAllowedEmail(email)) {
    // A session for another domain can only exist from before the domain rule
    // was enforced, or from someone working around the form. Either way it is
    // dropped here rather than left half-working.
    await supabase.auth.signOut();
    return null;
  }
  return data.session ? email : null;
}
