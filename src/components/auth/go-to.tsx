import { useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

/**
 * Navigates once the page has hydrated, rendering nothing in the meantime.
 *
 * The auth pages and guards use this instead of throwing `redirect()` from
 * beforeLoad. A redirect thrown during the first load swaps the route before
 * React has hydrated the server's HTML, so the browser tries to attach a
 * different page to it — a hydration error on every signed-out visit. Deciding
 * in beforeLoad but moving in an effect keeps hydration and navigation apart.
 */
export function GoTo({ href }: { href: string }) {
  const navigate = useNavigate();
  useEffect(() => {
    void navigate({ href, replace: true });
  }, [href, navigate]);
  return null;
}

/** The login page, remembering where the visitor was headed. */
export function GoToLogin({ returnTo }: { returnTo: string }) {
  return <GoTo href={`/login?redirect=${encodeURIComponent(returnTo)}`} />;
}
