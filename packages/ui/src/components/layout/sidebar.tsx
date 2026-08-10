import { ChevronUp, PanelLeft } from "lucide-react";
import { useState } from "react";
import { Link, useLocation } from "react-router";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { APP_VERSION } from "@/lib/version";
import { getV2NavGroups, isActivePath, type UiNavGroup, type UiNavItem } from "./nav-config";
import { useSidebar } from "./sidebar-context";

function ExpandedNavLink({ item, pathname }: { item: UiNavItem; pathname: string }) {
	const active = isActivePath(pathname, item.href);
	return (
		<Link
			to={item.href}
			data-nav-label={item.label}
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

	return (
		<div>
			<div className="px-3 mt-2">
				<button
					type="button"
					onClick={() => setOpen(!open)}
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
			</div>
			<div
				className="grid overflow-hidden"
				style={{
					gridTemplateRows: open ? "1fr" : "0fr",
					transition: "grid-template-rows 200ms ease-out",
				}}
			>
				<div className="min-h-0 overflow-hidden">
					<div className="flex flex-col gap-0.5 px-3">
						{group.items.map((item) => (
							<ExpandedNavLink key={item.href} item={item} pathname={pathname} />
						))}
					</div>
				</div>
			</div>
		</div>
	);
}

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
				className={cn(
					"sticky top-0 flex h-screen shrink-0 flex-col bg-background transition-all duration-300 ease-in-out overflow-hidden",
					showCollapsed ? "w-[68px]" : "w-[260px]",
				)}
			>
				{showCollapsed ? (
					<div className="flex h-screen w-[68px] flex-col items-center">
						<div className="flex h-14 w-full items-center justify-start pl-6 pr-3">
							<img src="/logo-24.png" alt="X-Ray" width={24} height={24} className="shrink-0" />
						</div>
						<Tooltip>
							<TooltipTrigger asChild>
								<button
									type="button"
									onClick={toggle}
									aria-label="Expand sidebar"
									className="flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors mb-2"
								>
									<PanelLeft className="h-4 w-4" strokeWidth={1.5} />
								</button>
							</TooltipTrigger>
							<TooltipContent side="right" sideOffset={8}>
								Expand sidebar
							</TooltipContent>
						</Tooltip>
						<nav className="flex-1 flex flex-col items-center gap-1 overflow-y-auto pt-1">
							{flatItems.map((item) => (
								<CollapsedNavLink key={item.href} item={item} pathname={pathname} />
							))}
						</nav>
						<div className="py-3 flex justify-center w-full">
							<Avatar className="h-9 w-9">
								<AvatarFallback className="bg-primary text-primary-foreground text-xs">
									XR
								</AvatarFallback>
							</Avatar>
						</div>
					</div>
				) : (
					<div className="flex h-screen w-[260px] flex-col">
						<div className="flex h-14 items-center justify-between px-5">
							<div className="flex items-center gap-2.5">
								<img src="/logo-24.png" alt="X-Ray" width={24} height={24} />
								<span className="font-display text-base font-semibold tracking-tight">X-Ray</span>
								<span className="text-[10px] text-muted-foreground/70">v{APP_VERSION}</span>
							</div>
							{!mobile && (
								<button
									type="button"
									onClick={toggle}
									aria-label="Collapse sidebar"
									className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
								>
									<PanelLeft className="h-4 w-4" strokeWidth={1.5} />
								</button>
							)}
						</div>

						<nav className="flex-1 overflow-y-auto pb-4" data-testid="sidebar-nav">
							{groups.map((group) => (
								<NavGroupSection key={group.label} group={group} pathname={pathname} />
							))}
						</nav>

						<div className="border-t border-border/60 px-4 py-3">
							<div className="flex items-center gap-3 rounded-lg px-2 py-2">
								<Avatar className="h-9 w-9">
									<AvatarFallback className="bg-primary text-primary-foreground text-xs">
										XR
									</AvatarFallback>
								</Avatar>
								<div className="min-w-0 flex-1">
									<p className="truncate text-sm font-medium">Dev User</p>
									<p className="truncate text-xs text-muted-foreground">local bypass</p>
								</div>
							</div>
							{mobile && (
								<button
									type="button"
									onClick={() => setMobileOpen(false)}
									className="mt-1 w-full rounded-lg px-3 py-2 text-left text-sm text-muted-foreground hover:bg-accent"
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
