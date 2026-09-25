// Who may use the dashboard: people with a @mediallianz.com address.
//
// Client-safe and shared, so the sign-up form, the route guard and the server
// middleware all apply the SAME rule. The database enforces it a fourth time
// (migration 0011), so no single layer is trusted on its own.

export const ALLOWED_EMAIL_DOMAIN = "mediallianz.com";

/**
 * Exactly one "@", then exactly the domain — anchored at both ends.
 *
 * A "contains" or "ends with" test would accept "x@evil.mediallianz.com" or
 * "x@mediallianz.com.evil.io"; splitting on "@" would accept
 * "a@mediallianz.com@evil.io". This accepts only the real domain.
 */
const ALLOWED = /^[^@\s]+@mediallianz\.com$/i;

export function isAllowedEmail(email: string | null | undefined): boolean {
  return typeof email === "string" && ALLOWED.test(email.trim());
}

/** A same-site path to return to after login, or "/" — never an external URL. */
export function safeRedirect(target: string | null | undefined): string {
  if (!target || !target.startsWith("/") || target.startsWith("//") || target.startsWith("/\\")) {
    return "/";
  }
  return target;
}
