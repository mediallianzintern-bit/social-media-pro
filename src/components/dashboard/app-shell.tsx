import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { Activity, Instagram, LayoutDashboard, Linkedin, LogOut, Radio } from "lucide-react";
import { useEffect, type ReactNode } from "react";

import { supabase } from "@/integrations/supabase/client";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { RangePicker } from "@/components/dashboard/range-picker";
import { SyncButton } from "@/components/dashboard/sync-button";

const NAV = [
  { to: "/", label: "Overview", icon: LayoutDashboard, group: "Analytics" },
  { to: "/instagram", label: "Instagram", icon: Instagram, group: "Platforms" },
  { to: "/linkedin", label: "LinkedIn", icon: Linkedin, group: "Platforms" },
  { to: "/sources", label: "Data sources", icon: Radio, group: "Setup" },
] as const;

const GROUPS = ["Analytics", "Platforms", "Setup"] as const;

export function AppShell({
  children,
  lastSyncedAt,
  stale,
  autoSync,
  syncDisabled,
  userEmail,
}: {
  children: ReactNode;
  lastSyncedAt: string | null;
  stale: boolean;
  autoSync: boolean;
  syncDisabled: boolean;
  userEmail: string;
}) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Leaving drops every cached query, so the next person at this browser does
  // not see the last one's data flash up before the login page.
  async function signOut() {
    await supabase.auth.signOut();
    queryClient.clear();
    await navigate({ to: "/login" });
  }

  // A session can also end elsewhere — another tab signing out, or a refresh
  // token expiring. Follow it rather than leave a dashboard of failing requests.
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        queryClient.clear();
        void navigate({ to: "/login" });
      }
    });
    return () => data.subscription.unsubscribe();
  }, [navigate, queryClient]);
  const active = NAV.find((item) => item.to === pathname) ?? NAV[0];

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon">
        <SidebarHeader>
          <div className="flex items-center gap-2 px-2 py-1.5">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Activity className="size-4" aria-hidden />
            </div>
            <div className="grid flex-1 text-left leading-tight group-data-[collapsible=icon]:hidden">
              <span className="truncate text-sm font-semibold">Social Command Center</span>
              <span className="truncate text-xs text-muted-foreground">Dr. Pritesh Patel</span>
            </div>
          </div>
        </SidebarHeader>
        <SidebarContent>
          {GROUPS.map((group) => (
            <SidebarGroup key={group}>
              <SidebarGroupLabel>{group}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {NAV.filter((item) => item.group === group).map((item) => (
                    <SidebarMenuItem key={item.to}>
                      <SidebarMenuButton
                        asChild
                        isActive={pathname === item.to}
                        tooltip={item.label}
                      >
                        <Link to={item.to}>
                          <item.icon aria-hidden />
                          <span>{item.label}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))}
        </SidebarContent>
        <SidebarFooter>
          <p className="px-2 pb-1 text-[11px] leading-snug text-muted-foreground group-data-[collapsible=icon]:hidden">
            Public metrics scraped via Apify, stored on every sync.
          </p>
          <SidebarMenu>
            <SidebarMenuItem>
              <div className="truncate px-2 pb-1 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
                Signed in as <span className="font-medium text-foreground">{userEmail}</span>
              </div>
              <SidebarMenuButton onClick={() => void signOut()} tooltip="Sign out">
                <LogOut aria-hidden />
                <span>Sign out</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>

      <SidebarInset>
        <header className="sticky top-0 z-10 flex h-16 shrink-0 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/80">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <h1 className="text-base font-semibold">{active.label}</h1>
          <div className="ml-auto flex items-center gap-3">
            <RangePicker />
            <SyncButton
              lastSyncedAt={lastSyncedAt}
              stale={stale}
              auto={autoSync}
              disabled={syncDisabled}
            />
          </div>
        </header>
        <main className="flex flex-1 flex-col gap-6 p-4 md:p-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
