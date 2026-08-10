import { ChevronUp, PanelLeft } from "lucide-react";
import { useState } from "react";
import { Link, useLocation } from "react-router";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn, getAvatarColor } from "@/lib/utils";
import { APP_VERSION } from "@/lib/version";
import { getV2NavGroups, isActivePath, type UiNavGroup, type UiNavItem } from "./nav-config";
import { useSidebar } from "./sidebar-context";
import { SIDEBAR_GEOMETRY as G } from "./sidebar-geometry";

function ExpandedNavLink({ item, pathname }: { item: UiNavItem; pathname: string }) {
	const active = isActivePath(pathname, item.href);
	return (
		<Link
			to={item.href}
			data-nav-label={item.label}
			aria-current={active ? "page" : undefined}
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

function CollapsedNavLink({ item, pathname }: { item: UiNavItem; pathname: string }) {
	const active = isActivePath(pathname, item.href);
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<Link
					to={item.href}
					data-nav-label={item.label}
					aria-label={item.label}
					aria-current={active ? "page" : undefined}
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

function NavGroupSection({ group, pathname }: { group: UiNavGroup; pathname: string }) {
	const [open, setOpen] = useState(group.defaultOpen);
	const panelId = `nav-group-${group.label.replaceAll(/\s+/g, "-").toLowerCase()}`;

	return (
		<Collapsible open={open} onOpenChange={setOpen}>
			<div className={cn("mt-2", G.groupBandPadClass)}>
				<CollapsibleTrigger asChild>
					<button
						type="button"
						aria-expanded={open}
						aria-controls={panelId}
						className="flex w-full items-center justify-between py-2.5"
					>
						<span className="text-xs font-medium uppercase tracking-wider text-muted-foreground/70">
							{group.label}
						</span>
						<ChevronUp
							className={cn(
								"h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200",
								!open && "rotate-180",
							)}
							strokeWidth={1.5}
							aria-hidden="true"
						/>
					</button>
				</CollapsibleTrigger>
			</div>
			<CollapsibleContent id={panelId}>
				<div className={cn("flex flex-col gap-0.5 pb-1", G.navItemsPadClass)}>
					{group.items.map((item) => (
						<ExpandedNavLink key={item.href} item={item} pathname={pathname} />
					))}
				</div>
			</CollapsibleContent>
		</Collapsible>
	);
}

const DEV_USER = { name: "Dev User", email: "local bypass", initial: "D" };

export function Sidebar({ mobile = false }: { mobile?: boolean }) {
	const { pathname } = useLocation();
	const { collapsed, toggle, setMobileOpen } = useSidebar();
	const groups = getV2NavGroups();
	const flatItems = groups.flatMap((g) => g.items);
	const showCollapsed = !mobile && collapsed;

	return (
		<TooltipProvider delayDuration={0}>
			<aside
				aria-label={mobile ? "Main navigation drawer" : "Main navigation"}
				data-testid="app-sidebar"
				data-collapsed={showCollapsed ? "true" : "false"}
				className={cn(
					"sticky top-0 flex h-screen shrink-0 flex-col overflow-hidden bg-background transition-[width] duration-300 ease-in-out",
					showCollapsed ? G.collapsedWidthClass : G.expandedWidthClass,
				)}
			>
				{showCollapsed ? (
					<div className={cn("flex h-screen flex-col items-center", G.collapsedWidthClass)}>
						<div className={cn("flex h-14 w-full items-center justify-start", G.headerPadClass)}>
							<img
								src="/logo-24.png"
								alt="X-Ray"
								width={G.logoSizePx}
								height={G.logoSizePx}
								className="shrink-0"
							/>
						</div>

						<Tooltip>
							<TooltipTrigger asChild>
								<button
									type="button"
									onClick={toggle}
									aria-label="Expand sidebar"
									aria-expanded={false}
									className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
								>
									<PanelLeft className="h-4 w-4" aria-hidden="true" strokeWidth={1.5} />
								</button>
							</TooltipTrigger>
							<TooltipContent side="right" sideOffset={8}>
								Expand sidebar
							</TooltipContent>
						</Tooltip>

						<nav className="flex flex-1 flex-col items-center gap-1 overflow-y-auto pt-1">
							{flatItems.map((item) => (
								<CollapsedNavLink key={item.href} item={item} pathname={pathname} />
							))}
						</nav>

						<div className="flex w-full justify-center py-3">
							<Avatar className="h-9 w-9 shrink-0">
								<AvatarFallback className={cn("text-xs text-white", getAvatarColor(DEV_USER.name))}>
									{DEV_USER.initial}
								</AvatarFallback>
							</Avatar>
						</div>
					</div>
				) : (
					<div className={cn("flex h-screen flex-col", G.expandedWidthClass)}>
						<div className={cn("flex h-14 items-center", G.headerPadClass)}>
							<div className="flex w-full items-center justify-between gap-2">
								<div className="flex min-w-0 items-center gap-3">
									<img
										src="/logo-24.png"
										alt="X-Ray"
										width={G.logoSizePx}
										height={G.logoSizePx}
										className="shrink-0"
									/>
									<span className="font-mono text-lg font-bold tracking-tighter">X-Ray</span>
									<span className="rounded-md bg-secondary px-1.5 py-0 text-[10px] font-normal leading-5 text-muted-foreground">
										v{APP_VERSION}
									</span>
								</div>
								{!mobile && (
									<button
										type="button"
										onClick={toggle}
										aria-label="Collapse sidebar"
										aria-expanded={true}
										className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground"
									>
										<PanelLeft className="h-4 w-4" aria-hidden="true" strokeWidth={1.5} />
									</button>
								)}
							</div>
						</div>

						<nav className="flex-1 overflow-y-auto pt-1" data-testid="sidebar-nav">
							<div className="flex flex-col">
								{groups.map((group) => (
									<NavGroupSection key={group.label} group={group} pathname={pathname} />
								))}
							</div>
						</nav>

						<div className={G.footerPadClass}>
							<div className="flex items-center gap-3">
								<Avatar className="h-9 w-9 shrink-0">
									<AvatarFallback
										className={cn("text-xs text-white", getAvatarColor(DEV_USER.name))}
									>
										{DEV_USER.initial}
									</AvatarFallback>
								</Avatar>
								<div className="min-w-0 flex-1">
									<p className="truncate text-sm font-medium text-foreground">{DEV_USER.name}</p>
									<p className="truncate text-xs text-muted-foreground">{DEV_USER.email}</p>
								</div>
							</div>
							{mobile && (
								<button
									type="button"
									onClick={() => setMobileOpen(false)}
									className="mt-2 w-full rounded-lg px-3 py-2 text-left text-sm text-muted-foreground hover:bg-accent"
								>
									Close menu
								</button>
							)}
						</div>
					</div>
				)}
			</aside>
		</TooltipProvider>
	);
}
