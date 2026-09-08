import {
	Avatar,
	AvatarFallback,
	AvatarImage,
	Sidebar as BasaltSidebar,
	Button,
	SidebarFooter,
	SidebarGroup,
	SidebarHeader,
	SidebarItem,
	SidebarNav,
	SidebarUser,
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@nocoo/basalt";
import { PanelLeft, Plus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useLocation } from "react-router";
import { fetchGroups, type Group } from "@/api/groups";
import { fetchWatchlists, type Watchlist } from "@/api/watchlists";
import { useCreateDialogs } from "@/components/dialogs/create-dialogs-context";
import { useAuthUser } from "@/hooks/me-context";
import { cn, getAvatarColor } from "@/lib/utils";
import { APP_VERSION } from "@/lib/version";
import { resolveIcon } from "@/lib/watchlist-icons";
import { getV2NavGroups, isActivePath, type UiNavItem } from "./nav-config";

function useSidebarUser() {
	const user = useAuthUser();
	const name = user.name?.trim() || user.email.split("@")[0] || "User";
	const email = user.email;
	const initial = (name[0] ?? email[0] ?? "?").toUpperCase();
	return { name, email, initial, image: user.image };
}

function useSidebarWatchlists(listVersion: number) {
	const [watchlists, setWatchlists] = useState<Pick<Watchlist, "id" | "name" | "icon">[]>([]);
	const refresh = useCallback(async () => {
		try {
			const data = await fetchWatchlists();
			setWatchlists(data.map((w) => ({ id: w.id, name: w.name, icon: w.icon })));
		} catch {
			/* sidebar must not break app */
		}
	}, []);
	useEffect(() => {
		void listVersion;
		void refresh();
	}, [refresh, listVersion]);
	return { watchlists };
}

function useSidebarGroups(listVersion: number) {
	const [groups, setGroups] = useState<Pick<Group, "id" | "name" | "icon">[]>([]);
	const refresh = useCallback(async () => {
		try {
			const data = await fetchGroups();
			setGroups(data.map((g) => ({ id: g.id, name: g.name, icon: g.icon })));
		} catch {
			/* sidebar must not break app */
		}
	}, []);
	useEffect(() => {
		void listVersion;
		void refresh();
	}, [refresh, listVersion]);
	return { groups };
}

function XrayMark() {
	return <img src="/logo-24.png" alt="X-Ray" width={24} height={24} className="shrink-0" />;
}

function navItemClass(active: boolean, className?: string) {
	return cn(
		"flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-normal transition-colors",
		active
			? "bg-basalt-accent text-basalt-foreground"
			: "text-basalt-muted-foreground hover:bg-basalt-accent hover:text-basalt-foreground",
		className,
	);
}

function navIconClass(active: boolean, className?: string) {
	return cn(
		"relative flex h-10 w-10 items-center justify-center rounded-lg transition-colors",
		active
			? "bg-basalt-accent text-basalt-foreground"
			: "text-basalt-muted-foreground hover:bg-basalt-accent hover:text-basalt-foreground",
		className,
	);
}

function EntityNavItem({
	href,
	name,
	icon,
	pathname,
	search = "",
}: {
	href: string;
	name: string;
	icon: string;
	pathname: string;
	search?: string;
}) {
	const Icon = resolveIcon(icon);
	const active = href.includes("?")
		? `${pathname}${search}` === href ||
			(pathname === href.split("?")[0] && search.includes(href.split("?")[1] ?? ""))
		: isActivePath(pathname, href);
	return (
		<Link
			to={href}
			aria-current={active ? "page" : undefined}
			data-nav-label={name}
			className={navItemClass(active, "py-2")}
		>
			<div
				className={cn(
					"flex h-5 w-5 shrink-0 items-center justify-center rounded",
					getAvatarColor(name),
				)}
			>
				<Icon className="h-3 w-3 text-white" strokeWidth={2} />
			</div>
			<span className="flex-1 truncate text-left">{name}</span>
		</Link>
	);
}

function NewEntityItem({ label, onClick }: { label: string; onClick: () => void }) {
	return (
		<SidebarItem onClick={onClick} className="py-2 text-basalt-muted-foreground/60">
			<div className="flex h-5 w-5 items-center justify-center rounded border border-dashed border-basalt-muted-foreground/30">
				<Plus className="h-3 w-3" strokeWidth={2} />
			</div>
			<span className="flex-1 text-left">{label}</span>
		</SidebarItem>
	);
}

export function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
	const { pathname, search } = useLocation();
	const user = useSidebarUser();
	const { openCreateWatchlist, openCreateGroup, listVersion } = useCreateDialogs();
	const { watchlists } = useSidebarWatchlists(listVersion);
	const { groups: entityGroups } = useSidebarGroups(listVersion);
	const navGroups = getV2NavGroups();
	const flatItems = navGroups.flatMap((g) => g.items);

	const avatar = (
		<Avatar className="h-9 w-9 shrink-0">
			{user.image ? <AvatarImage src={user.image} alt={user.name} /> : null}
			<AvatarFallback className={cn("text-xs text-white", getAvatarColor(user.name))}>
				{user.initial}
			</AvatarFallback>
		</Avatar>
	);

	if (collapsed) {
		return (
			<BasaltSidebar
				collapsed
				aria-label="Main navigation"
				data-testid="app-sidebar"
				data-collapsed="true"
			>
				<SidebarHeader className="justify-start px-0 pl-6">
					<XrayMark />
				</SidebarHeader>
				<Button
					variant="ghost"
					size="icon"
					className="mb-1 h-10 w-10 self-center"
					onClick={onToggle}
					aria-label="Expand sidebar"
				>
					<PanelLeft aria-hidden="true" strokeWidth={1.5} />
				</Button>
				<SidebarNav className="w-full items-center gap-1 pt-1">
					{flatItems.map((item: UiNavItem) => (
						<Tooltip key={item.href} delayDuration={0}>
							<TooltipTrigger asChild>
								<Link
									to={item.href}
									aria-label={item.label}
									aria-current={isActivePath(pathname, item.href) ? "page" : undefined}
									data-nav-label={item.label}
									className={navIconClass(isActivePath(pathname, item.href), "self-center")}
								>
									<item.icon className="h-4 w-4" strokeWidth={1.5} />
								</Link>
							</TooltipTrigger>
							<TooltipContent side="right" sideOffset={8}>
								{item.label}
							</TooltipContent>
						</Tooltip>
					))}
				</SidebarNav>
				<SidebarFooter className="flex w-full justify-center px-0">
					<Tooltip delayDuration={0}>
						<TooltipTrigger asChild>
							<span className="inline-flex">{avatar}</span>
						</TooltipTrigger>
						<TooltipContent side="right" sideOffset={8}>
							{user.name}
						</TooltipContent>
					</Tooltip>
				</SidebarFooter>
			</BasaltSidebar>
		);
	}

	return (
		<BasaltSidebar
			collapsed={false}
			aria-label="Main navigation"
			data-testid="app-sidebar"
			data-collapsed="false"
		>
			<SidebarHeader>
				<div className="flex w-full items-center justify-between">
					<div className="flex min-w-0 items-center gap-3 pl-3">
						<XrayMark />
						<span className="truncate font-mono text-lg font-bold tracking-tighter text-basalt-foreground">
							X-Ray
						</span>
						<span className="shrink-0 rounded-md bg-basalt-secondary px-1.5 py-0.5 text-[10px] leading-none font-medium text-basalt-muted-foreground">
							v{APP_VERSION}
						</span>
					</div>
					<Button
						variant="ghost"
						size="icon"
						className="h-7 w-7 shrink-0"
						onClick={onToggle}
						aria-label="Collapse sidebar"
					>
						<PanelLeft aria-hidden="true" strokeWidth={1.5} />
					</Button>
				</div>
			</SidebarHeader>
			<SidebarNav className="pt-1" data-testid="sidebar-nav">
				{navGroups.map((group) => {
					if (group.dynamic === "watchlists") {
						return (
							<SidebarGroup key={group.label} label={group.label} defaultOpen={group.defaultOpen}>
								{watchlists.map((wl) => (
									<EntityNavItem
										key={wl.id}
										href={`/watchlist/${wl.id}`}
										name={wl.name}
										icon={wl.icon}
										pathname={pathname}
									/>
								))}
								<NewEntityItem label="New watchlist" onClick={openCreateWatchlist} />
							</SidebarGroup>
						);
					}
					if (group.dynamic === "groups") {
						return (
							<SidebarGroup key={group.label} label={group.label} defaultOpen={group.defaultOpen}>
								{entityGroups.map((g) => (
									<EntityNavItem
										key={g.id}
										href={`/groups?id=${g.id}`}
										name={g.name}
										icon={g.icon}
										pathname={pathname}
										search={search}
									/>
								))}
								<NewEntityItem label="New group" onClick={openCreateGroup} />
							</SidebarGroup>
						);
					}
					return (
						<SidebarGroup key={group.label} label={group.label} defaultOpen={group.defaultOpen}>
							{group.items.map((item) => (
								<Link
									key={item.href}
									to={item.href}
									aria-current={isActivePath(pathname, item.href) ? "page" : undefined}
									data-nav-label={item.label}
									className={navItemClass(isActivePath(pathname, item.href))}
								>
									<item.icon className="h-4 w-4 shrink-0" strokeWidth={1.5} />
									<span className="flex-1 truncate text-left">{item.label}</span>
								</Link>
							))}
						</SidebarGroup>
					);
				})}
			</SidebarNav>
			<SidebarFooter>
				<SidebarUser name={user.name} email={user.email} avatar={avatar} />
			</SidebarFooter>
		</BasaltSidebar>
	);
}
