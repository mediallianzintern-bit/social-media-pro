// Settings (13 Nov 2026, UI review): what used to crowd the menu's footer and
// the account pages, gathered in one place. Who is signed in, light or dark,
// the strategy changes the period dropdown reads from, where the data comes
// from, and how the numbers and scripts are made: the scraper, the AI models
// and what a script costs, which the review asked to keep off the main
// screens.
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate, useRouteContext } from "@tanstack/react-router";
import { ArrowRight, LogOut, Moon, Sun } from "lucide-react";

import { ErasPanel } from "@/components/dashboard/eras-panel";
import { TeamRoles } from "@/components/dashboard/team-roles";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useTheme } from "@/lib/use-theme";

export const Route = createFileRoute("/_app/settings")({ component: SettingsPage });

function SettingsPage() {
  const { staffEmail } = useRouteContext({ from: "/_app" });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { resolved, setPreference } = useTheme();

  // Leaving drops every cached query, so the next person at this browser does
  // not see the last one's data flash up before the login page.
  async function signOut() {
    await supabase.auth.signOut();
    queryClient.clear();
    await navigate({ to: "/login" });
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Account</CardTitle>
          <CardDescription className="text-sm">
            Signed in as <span className="font-medium text-foreground">{staffEmail}</span>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" className="h-11 gap-2" onClick={() => void signOut()}>
            <LogOut className="size-4" aria-hidden />
            Sign out
          </Button>
        </CardContent>
      </Card>

      <TeamRoles />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Appearance</CardTitle>
          <CardDescription className="text-sm">Light or dark, on this device.</CardDescription>
        </CardHeader>
        <CardContent className="flex gap-2">
          <Button
            variant={resolved === "light" ? "secondary" : "outline"}
            className="h-11 gap-2"
            aria-pressed={resolved === "light"}
            onClick={() => setPreference("light")}
          >
            <Sun className="size-4" aria-hidden />
            Light
          </Button>
          <Button
            variant={resolved === "dark" ? "secondary" : "outline"}
            className="h-11 gap-2"
            aria-pressed={resolved === "dark"}
            onClick={() => setPreference("dark")}
          >
            <Moon className="size-4" aria-hidden />
            Dark
          </Button>
          <Button variant="ghost" className="h-11" onClick={() => setPreference("system")}>
            Match this device
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Strategy changes</CardTitle>
          <CardDescription className="text-sm">
            The date the period dropdown's “Since strategy change” starts from. Both accounts read
            from the earliest one.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <ErasPanel platform="instagram" />
          <ErasPanel platform="linkedin" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Data sources</CardTitle>
          <CardDescription className="text-sm">
            Where each number comes from, what is connected, and what each refresh costs.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline" className="h-11 gap-2">
            <Link to="/sources">
              Open data sources
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">How the numbers and scripts are made</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm leading-relaxed text-muted-foreground">
          <p>
            Public figures (followers, views, likes, comments) are collected by Apify on every
            refresh and stored, so every period is read from the same history. Instagram&apos;s own
            figures (reach, saves, watch time) come from its Graph API, and LinkedIn&apos;s
            (impressions, members reached) from its own API.
          </p>
          <p>
            Scripts and posts are written by OpenAI: a first draft with gpt-4o-mini, then a rewrite
            with gpt-4o that is checked in code against the team&apos;s brief. A reel script costs
            about $0.08 to $0.12 and a LinkedIn post about $0.08 to $0.12. Refreshing the numbers
            uses Apify credit; reading them does not.
          </p>
          <p>
            “Typical” means the middle value: half your posts did better and half did worse, so one
            viral post does not move it.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
