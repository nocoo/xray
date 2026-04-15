"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import {
  LayoutDashboard,
  Settings,
  PanelLeft,
  LogOut,
  BarChart3,
  Search,
  TrendingUp,
  MessageSquare,
  Users,
  Bookmark,
  Heart,
  List,
  Eye,
  Webhook,
  Brain,
  ChevronUp,
  Plus,
  LinkIcon,
} from "lucide-react";
import { cn, getAvatarColor } from "@/lib/utils";
import { APP_VERSION } from "@/lib/version";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { resolveIcon } from "@/components/ui/icon-picker";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useSidebar } from "./sidebar-context";

// =============================================================================
// Navigation structure — collapsible groups
// =============================================================================

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement> & { strokeWidth?: number }>;
}

interface NavSection {
  /** Section title shown in expanded sidebar (null = no header, e.g. top-level items) */
  title: string | null;
  items: NavItem[];
}

interface NavGroup {
  label: string;
  items: NavItem[];
  defaultOpen?: boolean;
}

/** Static groups rendered before the dynamic Watchlists/Groups sections. */
const TOP_GROUPS: NavGroup[] = [
  {
    label: "Dashboard",
    defaultOpen: true,
    items: [
      { href: "/", label: "Dashboard", icon: LayoutDashboard },
    ],
  },
  {
    label: "Explore",
    defaultOpen: true,
    items: [
      { href: "/tweets", label: "Tweets", icon: Search },
      { href: "/users", label: "Users", icon: Users },
    ],
  },
];

/** Static groups rendered after the dynamic Watchlists/Groups sections. */
const BOTTOM_GROUPS: NavGroup[] = [
  {
    label: "My Account",
    defaultOpen: true,
    items: [
      { href: "/analytics", label: "Analytics", icon: TrendingUp },
      { href: "/bookmarks", label: "Bookmarks", icon: Bookmark },
      { href: "/likes", label: "Likes", icon: Heart },
      { href: "/lists", label: "Lists", icon: List },
      { href: "/messages", label: "Messages", icon: MessageSquare },
    ],
  },
  {
    label: "Integrations",
    defaultOpen: true,
    items: [
      { href: "/integrations/zheto", label: "zhe.to", icon: LinkIcon },
    ],
  },
  {
    label: "Settings",
    defaultOpen: true,
    items: [
      { href: "/usage", label: "Usage", icon: BarChart3 },
      { href: "/webhooks", label: "Webhooks", icon: Webhook },
      { href: "/ai-settings", label: "AI Settings", icon: Brain },
      { href: "/settings", label: "Settings", icon: Settings },
    ],
  },
];

// Legacy exports for compatibility (flat list of all static items)
const navSections: NavSection[] = [
  { title: null, items: TOP_GROUPS[0]?.items ?? [] },
  { title: "Explore World", items: TOP_GROUPS[1]?.items ?? [] },
  { title: "Watchlists", items: [{ href: "/watchlist", label: "Watchlists", icon: Eye }] },
  { title: "Groups", items: [{ href: "/groups", label: "Groups", icon: Users }] },
  { title: "My Account", items: BOTTOM_GROUPS[0]?.items ?? [] },
  { title: "Integrations", items: BOTTOM_GROUPS[1]?.items ?? [] },
  { title: null, items: BOTTOM_GROUPS[2]?.items ?? [] },
];
const allNavItems = navSections.flatMap((s) => s.items);

// =============================================================================
// Watchlist sidebar data
// =============================================================================

interface SidebarWatchlist {
  id: number;
  name: string;
  icon: string;
}

function useWatchlists() {
  const [watchlists, setWatchlists] = useState<SidebarWatchlist[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/watchlists");
      if (!res.ok) return;
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        setWatchlists(
          json.data.map((w: { id: number; name: string; icon: string }) => ({
            id: w.id,
            name: w.name,
            icon: w.icon,
          })),
        );
      }
    } catch {
      // Silently fail — sidebar should never break the app
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { watchlists, loading, refresh };
}

// =============================================================================
// Group sidebar data
// =============================================================================

interface SidebarGroup {
  id: number;
  name: string;
  icon: string;
}

function useGroups() {
  const [groups, setGroups] = useState<SidebarGroup[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/groups");
      if (!res.ok) return;
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        setGroups(
          json.data.map((g: { id: number; name: string; icon: string }) => ({
            id: g.id,
            name: g.name,
            icon: g.icon,
          })),
        );
      }
    } catch {
      // Silently fail — sidebar should never break the app
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { groups, loading, refresh };
}

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

// =============================================================================
// Reusable rendering helpers
// =============================================================================

/** Render a single nav link (expanded mode). */
function ExpandedNavLink({
  item,
  pathname,
}: {
  item: NavItem;
  pathname: string;
}) {
  const active = isActive(pathname, item.href);
  return (
    <Link
      href={item.href}
      className={cn(
        "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-normal transition-colors",
        active
          ? "bg-accent text-foreground"
          : "text-muted-foreground hover:bg-accent hover:text-foreground",
      )}
    >
      <item.icon className="h-4 w-4 shrink-0" strokeWidth={1.5} />
      <span className="flex-1 text-left">{item.label}</span>
    </Link>
  );
}

/** Render a single nav link (collapsed mode). */
function CollapsedNavLink({
  item,
  pathname,
}: {
  item: NavItem;
  pathname: string;
}) {
  const active = isActive(pathname, item.href);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          href={item.href}
          className={cn(
            "relative flex h-10 w-10 items-center justify-center rounded-lg transition-colors",
            active
              ? "bg-accent text-foreground"
              : "text-muted-foreground hover:bg-accent hover:text-foreground",
          )}
        >
          <item.icon className="h-4 w-4" strokeWidth={1.5} />
        </Link>
      </TooltipTrigger>
      <TooltipContent side="right" sideOffset={8}>
        {item.label}
      </TooltipContent>
    </Tooltip>
  );
}

// =============================================================================
// Collapsible group (expanded mode) — Radix Collapsible + CSS Grid animation
// =============================================================================

function NavGroupSection({
  group,
  pathname,
  children,
}: {
  group: NavGroup;
  pathname: string;
  /** Optional extra content injected before the static items (e.g. WatchlistGroup) */
  children?: React.ReactNode;
}) {
  const [open, setOpen] = useState(group.defaultOpen ?? true);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      {/* Group header — clickable to toggle */}
      <div className="px-3 mt-2">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center justify-between px-3 py-2.5"
          >
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground/70">
              {group.label}
            </span>
            <span className="flex h-7 w-7 shrink-0 items-center justify-center">
              <ChevronUp
                className={cn(
                  "h-3.5 w-3.5 text-muted-foreground transition-transform duration-200",
                  !open && "rotate-180",
                )}
                strokeWidth={1.5}
              />
            </span>
          </button>
        </CollapsibleTrigger>
      </div>

      {/* Group content — CSS Grid height animation */}
      <CollapsibleContent forceMount>
        <div
          className="grid overflow-hidden"
          style={{
            gridTemplateRows: open ? "1fr" : "0fr",
            transition: "grid-template-rows 200ms ease-out",
          }}
        >
          <div className="min-h-0 overflow-hidden">
            <div className="flex flex-col gap-0.5 px-3">
              {children}
              {group.items.map((item) => (
                <ExpandedNavLink
                  key={item.href}
                  item={item}
                  pathname={pathname}
                />
              ))}
            </div>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

// =============================================================================
// Watchlist sidebar group (expanded mode)
// =============================================================================

function WatchlistGroup({
  watchlists,
  pathname,
}: {
  watchlists: SidebarWatchlist[];
  pathname: string;
}) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div>
      {/* Watchlists header — matches NavGroupSection style */}
      <div className="px-3 mt-2">
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="flex w-full items-center justify-between px-3 py-2.5"
        >
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground/70">
            Watchlists
          </span>
          <span className="flex h-7 w-7 shrink-0 items-center justify-center">
            <ChevronUp
              className={cn(
                "h-3.5 w-3.5 text-muted-foreground transition-transform duration-200",
                !expanded && "rotate-180",
              )}
              strokeWidth={1.5}
            />
          </span>
        </button>
      </div>

      {/* Watchlist items — CSS Grid height animation */}
      <div
        className="grid overflow-hidden"
        style={{
          gridTemplateRows: expanded ? "1fr" : "0fr",
          transition: "grid-template-rows 200ms ease-out",
        }}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="flex flex-col gap-0.5 px-3">
            {watchlists.map((wl) => {
              const WlIcon = resolveIcon(wl.icon);
              const href = `/watchlist/${wl.id}`;
              const active = isActive(pathname, href);
              return (
                <Link
                  key={wl.id}
                  href={href}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-normal transition-colors",
                    active
                      ? "bg-accent text-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground",
                  )}
                >
                  <div
                    className={cn(
                      "flex h-5 w-5 items-center justify-center rounded",
                      getAvatarColor(wl.name),
                    )}
                  >
                    <WlIcon className="h-3 w-3 text-white" strokeWidth={2} />
                  </div>
                  <span className="flex-1 text-left truncate">{wl.name}</span>
                </Link>
              );
            })}
            {/* New watchlist button */}
            <Link
              href="/watchlist?new=1"
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-normal transition-colors text-muted-foreground/60 hover:bg-accent hover:text-foreground"
            >
              <div className="flex h-5 w-5 items-center justify-center rounded border border-dashed border-muted-foreground/30">
                <Plus className="h-3 w-3" strokeWidth={2} />
              </div>
              <span className="flex-1 text-left">New watchlist</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Groups sidebar group (expanded mode)
// =============================================================================

function GroupsGroup({
  groups,
  pathname,
}: {
  groups: SidebarGroup[];
  pathname: string;
}) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div>
      {/* Groups header — matches NavGroupSection style */}
      <div className="px-3 mt-2">
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="flex w-full items-center justify-between px-3 py-2.5"
        >
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground/70">
            Groups
          </span>
          <span className="flex h-7 w-7 shrink-0 items-center justify-center">
            <ChevronUp
              className={cn(
                "h-3.5 w-3.5 text-muted-foreground transition-transform duration-200",
                !expanded && "rotate-180",
              )}
              strokeWidth={1.5}
            />
          </span>
        </button>
      </div>

      {/* Group items — CSS Grid height animation */}
      <div
        className="grid overflow-hidden"
        style={{
          gridTemplateRows: expanded ? "1fr" : "0fr",
          transition: "grid-template-rows 200ms ease-out",
        }}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="flex flex-col gap-0.5 px-3">
            {groups.map((g) => {
              const GIcon = resolveIcon(g.icon);
              const href = `/groups/${g.id}`;
              const active = isActive(pathname, href);
              return (
                <Link
                  key={g.id}
                  href={href}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-normal transition-colors",
                    active
                      ? "bg-accent text-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground",
                  )}
                >
                  <div
                    className={cn(
                      "flex h-5 w-5 items-center justify-center rounded",
                      getAvatarColor(g.name),
                    )}
                  >
                    <GIcon className="h-3 w-3 text-white" strokeWidth={2} />
                  </div>
                  <span className="flex-1 text-left truncate">{g.name}</span>
                </Link>
              );
            })}
            {/* New group button */}
            <Link
              href="/groups?new=1"
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-normal transition-colors text-muted-foreground/60 hover:bg-accent hover:text-foreground"
            >
              <div className="flex h-5 w-5 items-center justify-center rounded border border-dashed border-muted-foreground/30">
                <Plus className="h-3 w-3" strokeWidth={2} />
              </div>
              <span className="flex-1 text-left">New group</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Main Sidebar component
// =============================================================================

export function Sidebar() {
  const rawPathname = usePathname();
  const { collapsed, toggle } = useSidebar();
  const { data: session } = useSession();
  const { watchlists } = useWatchlists();
  const { groups } = useGroups();

  // Defer pathname to avoid hydration mismatch — vinext SSR may return a
  // different pathname than the client, causing className diff on active links.
  const [pathname, setPathname] = useState("");
  useEffect(() => {
    setPathname(rawPathname);
  }, [rawPathname]);

  const userName = session?.user?.name ?? "User";
  const userEmail = session?.user?.email ?? "";
  const userImage = session?.user?.image;
  const userInitial = userName[0] ?? "?";

  return (
    <TooltipProvider delayDuration={0}>
      <aside
        className={cn(
          "sticky top-0 flex h-screen shrink-0 flex-col bg-background transition-all duration-300 ease-in-out overflow-hidden",
          collapsed ? "w-[68px]" : "w-[260px]",
        )}
      >
        {collapsed ? (
          /* ================================================================
           * Collapsed (icon-only) view
           * ================================================================ */
          <div className="flex h-screen w-[68px] flex-col items-center">
            {/* Logo */}
            <div className="flex h-14 w-full items-center justify-start pl-6 pr-3">
              <img
                src="/logo-24.png"
                alt="X-Ray"
                width={24}
                height={24}
                className="shrink-0"
              />
            </div>

            {/* Expand toggle */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={toggle}
                  aria-label="Expand sidebar"
                  className="flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors mb-2"
                >
                  <PanelLeft
                    className="h-4 w-4"
                    aria-hidden="true"
                    strokeWidth={1.5}
                  />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={8}>
                Expand sidebar
              </TooltipContent>
            </Tooltip>

            {/* Navigation — collapsed: grouped icon list */}
            <nav className="flex-1 flex flex-col items-center gap-1 overflow-y-auto pt-1">
              {/* Top static groups */}
              {TOP_GROUPS.map((group, gIdx) => (
                <div key={group.label} className="flex flex-col items-center gap-1">
                  {gIdx > 0 && <div className="my-1 h-px w-6 bg-border" />}
                  {group.items.map((item) => (
                    <CollapsedNavLink
                      key={item.href}
                      item={item}
                      pathname={pathname}
                    />
                  ))}
                </div>
              ))}

              {/* Watchlists + Groups as their own section */}
              <div className="flex flex-col items-center gap-1">
                <div className="my-1 h-px w-6 bg-border" />
                <CollapsedNavLink
                  item={{ href: "/watchlist", label: "Watchlists", icon: Eye }}
                  pathname={pathname}
                />
                <CollapsedNavLink
                  item={{ href: "/groups", label: "Groups", icon: Users }}
                  pathname={pathname}
                />
              </div>

              {/* Bottom static groups */}
              {BOTTOM_GROUPS.map((group) => (
                <div key={group.label} className="flex flex-col items-center gap-1">
                  <div className="my-1 h-px w-6 bg-border" />
                  {group.items.map((item) => (
                    <CollapsedNavLink
                      key={item.href}
                      item={item}
                      pathname={pathname}
                    />
                  ))}
                </div>
              ))}
            </nav>

            {/* User avatar + sign out */}
            <div className="py-3 flex justify-center w-full">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => signOut({ callbackUrl: "/login" })}
                    className="cursor-pointer"
                  >
                    <Avatar className="h-9 w-9">
                      {userImage && (
                        <AvatarImage src={userImage} alt={userName} />
                      )}
                      <AvatarFallback
                        className={cn(
                          "text-xs text-white",
                          getAvatarColor(userName),
                        )}
                      >
                        {userInitial}
                      </AvatarFallback>
                    </Avatar>
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" sideOffset={8}>
                  {userName} — Sign out
                </TooltipContent>
              </Tooltip>
            </div>
          </div>
        ) : (
          /* ================================================================
           * Expanded view
           * ================================================================ */
          <div className="flex h-screen w-[260px] flex-col">
            {/* Header: logo + collapse toggle */}
            <div className="px-3 h-14 flex items-center">
              <div className="flex w-full items-center justify-between px-3">
                <div className="flex items-center gap-3">
                  <img
                    src="/logo-24.png"
                    alt="X-Ray"
                    width={24}
                    height={24}
                    className="shrink-0"
                  />
                  <span className="text-lg font-bold tracking-tighter font-mono">
                    X-Ray
                  </span>
                  <Badge
                    variant="secondary"
                    className="text-[10px] px-1.5 py-0 font-normal text-muted-foreground"
                  >
                    v{APP_VERSION}
                  </Badge>
                </div>
                <button
                  onClick={toggle}
                  aria-label="Collapse sidebar"
                  className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:text-foreground transition-colors"
                >
                  <PanelLeft
                    className="h-4 w-4"
                    aria-hidden="true"
                    strokeWidth={1.5}
                  />
                </button>
              </div>
            </div>

            {/* Navigation — expanded: collapsible groups */}
            <nav className="flex-1 overflow-y-auto pt-1">
              <div className="flex flex-col">
                {/* Top static groups (Dashboard, Explore) */}
                {TOP_GROUPS.map((group) => (
                  <NavGroupSection
                    key={group.label}
                    group={group}
                    pathname={pathname}
                  />
                ))}

                {/* Watchlists — top-level collapsible section */}
                <WatchlistGroup
                  watchlists={watchlists}
                  pathname={pathname}
                />

                {/* Groups — top-level collapsible section */}
                <GroupsGroup
                  groups={groups}
                  pathname={pathname}
                />

                {/* Bottom static groups (My Account, Integrations, Settings) */}
                {BOTTOM_GROUPS.map((group) => (
                  <NavGroupSection
                    key={group.label}
                    group={group}
                    pathname={pathname}
                  />
                ))}
              </div>
            </nav>

            {/* User info + sign out */}
            <div className="px-4 py-3">
              <div className="flex items-center gap-3">
                <Avatar className="h-9 w-9 shrink-0">
                  {userImage && (
                    <AvatarImage src={userImage} alt={userName} />
                  )}
                  <AvatarFallback
                    className={cn(
                      "text-xs text-white",
                      getAvatarColor(userName),
                    )}
                  >
                    {userInitial}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {userName}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {userEmail}
                  </p>
                </div>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => signOut({ callbackUrl: "/login" })}
                      aria-label="Sign out"
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors shrink-0"
                    >
                      <LogOut
                        className="h-4 w-4"
                        aria-hidden="true"
                        strokeWidth={1.5}
                      />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top">Sign out</TooltipContent>
                </Tooltip>
              </div>
            </div>
          </div>
        )}
      </aside>
    </TooltipProvider>
  );
}

// Export for testing
export { navSections, allNavItems, isActive };
export type { NavItem, NavSection };
