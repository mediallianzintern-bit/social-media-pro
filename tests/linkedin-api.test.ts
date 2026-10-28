// The LinkedIn connection's own safety checks: who may finish a sign-in, and where to.
import { describe, expect, it } from "vitest";

import { checkState, connectUrl, makeState, redirectUri } from "@/server/linkedin-api";

const secret = "test-secret";
const now = Date.parse("2026-10-28T10:00:00Z");

describe("LinkedIn sign-in state", () => {
  it("accepts a state minted here, for the same staff member, recently", () => {
    const state = makeState("parth@mediallianz.com", secret, now);
    expect(checkState(state, "parth@mediallianz.com", secret, now + 60_000)).toBe(true);
  });

  it("refuses it for another staff member", () => {
    const state = makeState("parth@mediallianz.com", secret, now);
    expect(checkState(state, "someone@mediallianz.com", secret, now)).toBe(false);
  });

  it("refuses it after 15 minutes, or when tampered with", () => {
    const state = makeState("parth@mediallianz.com", secret, now);
    expect(checkState(state, "parth@mediallianz.com", secret, now + 16 * 60_000)).toBe(false);
    expect(checkState(`${state}x`, "parth@mediallianz.com", secret, now)).toBe(false);
    expect(checkState(state, "parth@mediallianz.com", "other-secret", now)).toBe(false);
  });
});

describe("LinkedIn redirect", () => {
  it("returns only to the dashboard's own sites", () => {
    expect(redirectUri("https://social.mediallianz.com/")).toBe(
      "https://social.mediallianz.com/connect/linkedin",
    );
    expect(redirectUri("http://localhost:8080")).toBe("http://localhost:8080/connect/linkedin");
    expect(() => redirectUri("https://evil.example.com")).toThrow();
  });

  it("asks LinkedIn for the post analytics permission only", () => {
    process.env["LINKEDIN_CLIENT_ID"] = "86cth51ugybwfv";
    process.env["LINKEDIN_CLIENT_SECRET"] = secret;
    const url = new URL(connectUrl("http://localhost:8080", "parth@mediallianz.com"));
    expect(url.origin + url.pathname).toBe("https://www.linkedin.com/oauth/v2/authorization");
    expect(url.searchParams.get("scope")).toBe("r_member_postAnalytics");
    expect(url.searchParams.get("redirect_uri")).toBe("http://localhost:8080/connect/linkedin");
  });
});
