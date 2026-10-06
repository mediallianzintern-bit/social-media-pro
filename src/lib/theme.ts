// Light and dark mode.
//
// The dark palette has existed in styles.css since the project started — a
// hand-selected set of values, not an automatic flip of the light one — but
// nothing ever added the `.dark` class that switches it on. This is that switch.
//
// Three concepts, deliberately kept apart:
//
//   Preference  what the person chose: "light", "dark", or "system".
//   Resolved    what that means right now — "system" becomes one of the other
//               two by asking the OS.
//   Applied     the `.dark` class on <html>, which is what CSS actually reads.

export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

/** Where the choice is remembered. Also read by the inline no-flash script. */
export const THEME_STORAGE_KEY = "theme";

/**
 * The default is "system", so a first-time visitor gets the mode their machine
 * is already in rather than whichever one we happened to hard-code.
 */
export const DEFAULT_THEME: ThemePreference = "system";

function isPreference(value: unknown): value is ThemePreference {
  return value === "light" || value === "dark" || value === "system";
}

/**
 * The stored preference, or the default.
 *
 * Every localStorage access here is wrapped: it throws outright in a Safari
 * private window and in any browser with site data blocked, and a theme is
 * never worth taking the page down for.
 */
export function readPreference(): ThemePreference {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isPreference(stored) ? stored : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

export function writePreference(preference: ThemePreference): void {
  try {
    if (preference === DEFAULT_THEME) window.localStorage.removeItem(THEME_STORAGE_KEY);
    else window.localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Storage denied. The theme still applies for this page — it just will not
    // be remembered, which is better than refusing to switch at all.
  }
}

/** What the OS is asking for. Defaults to light where the query is unsupported. */
export function systemTheme(): ResolvedTheme {
  try {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  } catch {
    return "light";
  }
}

export function resolveTheme(preference: ThemePreference): ResolvedTheme {
  return preference === "system" ? systemTheme() : preference;
}

/**
 * Puts the resolved theme on <html>.
 *
 * `colorScheme` is set alongside the class because the class only drives OUR
 * variables. Without it the browser keeps painting its own furniture — the
 * scrollbars, the date picker, the autofill highlight — in light colours on a
 * dark page.
 */
export function applyTheme(resolved: ResolvedTheme): void {
  const root = document.documentElement;
  root.classList.toggle("dark", resolved === "dark");
  root.style.colorScheme = resolved;
}

/**
 * The script that runs before the first paint.
 *
 * It has to be inline and synchronous in <head>: anything deferred until React
 * hydrates means the page paints light first and then flips, which is the flash
 * every dark-mode implementation is judged on.
 *
 * It deliberately duplicates the small amount of logic above rather than
 * importing it — at this point in the document no module has loaded, and the
 * bundle it would need is exactly what we are trying not to wait for.
 *
 * The three steps are guarded SEPARATELY rather than under one try. With a
 * single try, a browser that refuses localStorage — Safari in a private window,
 * or any browser with site data blocked — threw on the first line and skipped
 * the OS check too, so a machine set to dark got a light dashboard. Each step
 * now fails on its own and the later ones still run.
 */
export const NO_FLASH_SCRIPT = `(function(){var p=null;try{p=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)});}catch(e){}var d=false;try{d=p==="dark"||(p!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches);}catch(e){d=p==="dark";}try{var r=document.documentElement;r.classList.toggle("dark",d);r.style.colorScheme=d?"dark":"light";}catch(e){}})();`;
