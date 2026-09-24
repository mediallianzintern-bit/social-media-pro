// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  // Only read when the build targets Vercel; the Cloudflare/Lovable build
  // ignores it. A sync runs ~45-60s and an AI generation can run for minutes,
  // so the platform default would cut both off. 300s is the Hobby-plan ceiling;
  // on Pro it can go to 800 if generations still time out.
  nitro: {
    vercel: { functions: { maxDuration: 300 } },
  },
});
