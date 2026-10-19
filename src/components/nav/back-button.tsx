import { useRouter } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Back to wherever the person came from, or to `fallback` when this page was
 * opened directly (a pasted link, a new tab) and there is nothing to go back to.
 *
 * For the pages outside the app's navigation, the reports, where the browser's
 * own back button was the only way out. Never printed.
 */
export function BackButton({ fallback, label = "Back" }: { fallback: string; label?: string }) {
  const router = useRouter();
  return (
    <Button
      size="sm"
      variant="ghost"
      className="-ml-2 gap-1.5 text-muted-foreground hover:text-foreground print:hidden"
      onClick={() => {
        if (router.history.canGoBack()) router.history.back();
        else void router.navigate({ to: fallback });
      }}
    >
      <ArrowLeft className="size-4" aria-hidden />
      {label}
    </Button>
  );
}
