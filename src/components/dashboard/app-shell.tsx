// The frame around every signed-in screen: the menu, the header with the one
// period dropdown, and on a phone a bottom tab bar.
//
// 13 Nov 2026, UI review: the menu had ten items that overlapped (reaction
// hooks and news topics sat both in the menu and inside each account page).
// It is now five places to go, then the two accounts, then Settings, which
// holds what used to crowd the footer (data sources, dark mode, sign out).
import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  FileText,
  Film,
  House,
  Lightbulb,
  ListChecks,
  Settings,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
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
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { BrandMark } from "@/components/brand";
import { RangePicker } from "@/components/dashboard/range-picker";
import { SyncButton } from "@/components/dashboard/sync-button";
import { PLATFORM_META } from "@/lib/platform-meta";
import { useWaitingIdeas } from "@/lib/use-waiting-ideas";
import { cn } from "@/lib/utils";

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Other paths that light this item: the Ideas pages, Settings' data sources. */
  also?: string[];
}

const MAIN: NavItem[] = [
  { to: "/", label: "Home", icon: House },
  { to: "/workspace", label: "To do", icon: ListChecks },
  { to: "/ideas", label: "Ideas", icon: Lightbulb, also: ["/saved", "/trends", "/reactions"] },
  { to: "/filmed", label: "Published", icon: Film },
  { to: "/report", label: "Reports", icon: FileText },
];

const SETTINGS: NavItem = {
  to: "/settings",
  label: "Settings",
  icon: Settings,
  also: ["/sources"],
};

/** The page title in the header, for every route the shell frames. */
const TITLES: Record<string, string> = {
  "/": "Home",
  "/workspace": "To do",
  "/ideas": "Ideas",
  "/saved": "Ideas · Saved",
  "/trends": "Ideas · Trends",
  "/reactions": "Ideas · Reaction hooks",
  "/filmed": "Published",
  "/settings": "Settings",
  "/sources": "Settings · Data sources",
  "/instagram": "Instagram",
  "/linkedin": "LinkedIn",
};

/** Screens about the account's numbers, where the period dropdown applies. */
const HAS_PERIOD = new Set(["/", "/instagram", "/linkedin", "/filmed"]);

const isActive = (item: NavItem, pathname: string) =>
  pathname === item.to || Boolean(item.also?.includes(pathname));

export function AppShell({
  children,
  lastSyncedAt,
  stale,
  autoSync,
  syncDisabled,
  userEmail: _userEmail,
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
  const { waiting } = useWaitingIdeas();

  // A session can end elsewhere: another tab signing out, or a refresh token
  // expiring. Follow it rather than leave a dashboard of failing requests.
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        queryClient.clear();
        void navigate({ to: "/login" });
      }
    });
    return () => data.subscription.unsubscribe();
  }, [navigate, queryClient]);

  const title = TITLES[pathname] ?? "";
  const todo = waiting.length;

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon">
        <SidebarHeader>
          <div className="flex items-center gap-2 px-2 py-1.5">
            {/* The mark, not the lockup: this slot is all that survives when the
                sidebar collapses to icons, and the wordmark is illegible at 32px. */}
            <BrandMark />
            <div className="grid flex-1 text-left leading-tight group-data-[collapsible=icon]:hidden">
              <span className="truncate text-sm font-semibold">Social Command Center</span>
              <span className="truncate text-[13px] text-muted-foreground">Dr. Pritesh Patel</span>
            </div>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {MAIN.map((item) => (
                  <SidebarMenuItem key={item.to}>
                    <SidebarMenuButton
                      asChild
                      size="lg"
                      isActive={isActive(item, pathname)}
                      tooltip={item.label}
                      className="h-11 text-sm"
                    >
                      <Link to={item.to}>
                        <item.icon aria-hidden />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                    {item.to === "/workspace" && todo ? (
                      <SidebarMenuBadge className="top-3 rounded-full bg-primary px-2 text-[13px] text-primary-foreground">
                        {todo}
                      </SidebarMenuBadge>
                    ) : null}
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
          <SidebarGroup>
            <SidebarGroupLabel className="text-[13px]">Accounts</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {Object.values(PLATFORM_META).map((meta) => (
                  <SidebarMenuItem key={meta.id}>
                    <SidebarMenuButton
                      asChild
                      size="lg"
                      isActive={pathname === meta.route}
                      tooltip={meta.label}
                      className="h-11 text-sm"
                    >
                      <Link to={meta.route}>
                        <span
                          aria-hidden
                          className="mx-1 size-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: meta.color }}
                        />
                        <span>{meta.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                size="lg"
                isActive={isActive(SETTINGS, pathname)}
                tooltip={SETTINGS.label}
                className="h-11 text-sm"
              >
                <Link to={SETTINGS.to}>
                  <SETTINGS.icon aria-hidden />
                  <span>{SETTINGS.label}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>

      <SidebarInset>
        <header className="sticky top-0 z-10 flex min-h-16 shrink-0 flex-wrap items-center gap-2 border-b bg-background/95 px-4 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/80">
          <SidebarTrigger className="-ml-1 hidden md:inline-flex" />
          <Separator orientation="vertical" className="mr-2 hidden h-4 md:block" />
          <h1 className="text-base font-semibold">{title}</h1>
          <div className="ml-auto flex flex-wrap items-center gap-3">
            {HAS_PERIOD.has(pathname) ? <RangePicker /> : null}
            <SyncButton
              lastSyncedAt={lastSyncedAt}
              stale={stale}
              auto={autoSync}
              disabled={syncDisabled}
            />
          </div>
        </header>
        <main className="flex flex-1 flex-col gap-6 p-4 pb-24 md:p-6 md:pb-6">{children}</main>
      </SidebarInset>

      <BottomBar pathname={pathname} todo={todo} />
    </SidebarProvider>
  );
}

/**
 * The phone's menu (the mockup's Phone, Home): four tabs at the bottom,
 * within reach of a thumb. Hidden from tablet width up, where the sidebar is.
 */
function BottomBar({ pathname, todo }: { pathname: string; todo: number }) {
  const tabs: Array<NavItem & { badge?: number }> = [
    MAIN[0]!,
    { ...MAIN[1]!, badge: todo },
    MAIN[2]!,
    { to: "/instagram", label: "Accounts", icon: UsersRound, also: ["/linkedin"] },
  ];
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-4 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      {tabs.map((tab) => {
        const active = isActive(tab, pathname);
        return (
          <Link
            key={tab.to}
            to={tab.to}
            className={cn(
              "flex min-h-14 flex-col items-center justify-center gap-0.5 text-[13px]",
              active ? "font-semibold text-foreground" : "text-muted-foreground",
            )}
            aria-current={active ? "page" : undefined}
          >
            <tab.icon className="size-5" aria-hidden />
            <span>
              {tab.label}
              {tab.badge ? ` · ${tab.badge}` : ""}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
