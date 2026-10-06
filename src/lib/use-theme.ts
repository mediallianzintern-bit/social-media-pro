import { useCallback, useEffect, useState } from "react";

import {
  applyTheme,
  readPreference,
  resolveTheme,
  writePreference,
  type ResolvedTheme,
  type ThemePreference,
} from "@/lib/theme";

/**
 * The current theme, and a way to change it.
 *
 * State starts as "system" on both the server and the first client render,
 * rather than reading localStorage during render. The stored value is picked up
 * in an effect instead, because reading it during render makes the first client
 * render disagree with the server's and React throws out the whole tree. The
 * real theme is already on screen by then — the inline script applied it before
 * paint — so this only catches the React state up to what the document shows.
 */
export function useTheme(): {
  preference: ThemePreference;
  resolved: ResolvedTheme;
  setPreference: (preference: ThemePreference) => void;
  toggle: () => void;
} {
  const [preference, setPreferenceState] = useState<ThemePreference>("system");
  const [resolved, setResolved] = useState<ResolvedTheme>("light");

  useEffect(() => {
    const stored = readPreference();
    setPreferenceState(stored);
    setResolved(resolveTheme(stored));
  }, []);

  // Follow the OS while the choice is "system" — someone whose machine flips to
  // dark at sunset expects the dashboard to flip with it, without a reload.
  useEffect(() => {
    if (preference !== "system") return;
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      const next: ResolvedTheme = query.matches ? "dark" : "light";
      setResolved(next);
      applyTheme(next);
    };
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, [preference]);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    writePreference(next);
    const nextResolved = resolveTheme(next);
    setResolved(nextResolved);
    applyTheme(nextResolved);
  }, []);

  // Toggling always lands on an explicit light or dark, never back on "system":
  // a button whose job is "give me the other one" has to actually commit, or the
  // next OS change would silently undo the click.
  const toggle = useCallback(() => {
    setPreference(resolved === "dark" ? "light" : "dark");
  }, [resolved, setPreference]);

  return { preference, resolved, setPreference, toggle };
}
