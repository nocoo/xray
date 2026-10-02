import { Button, ContentIsland, Sheet, SheetContent, SheetTitle } from "@nocoo/basalt";
import { AppHeader } from "@nocoo/basalt/components/app-header";
import {
	AppMain,
	AppSkipLink,
	AppShell as BasaltAppShell,
} from "@nocoo/basalt/components/app-shell";
import { useTheme } from "@nocoo/basalt/providers/theme";
import { Menu } from "lucide-react";
import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useLayoutEffect,
	useState,
} from "react";
import { matchPath, useLocation } from "react-router";
import { Github } from "@/components/icons/github";
import { useRestoreDialogFocus } from "@/hooks/restore-dialog-focus";
import { useIsMobile } from "@/hooks/use-mobile";
import { documentTitle, SITE_TITLE } from "@/lib/document-title";
import { BreadcrumbsProvider, useBreadcrumbs } from "./breadcrumbs-context";
import { EnvironmentSwitch } from "./environment-switch";
import { HeaderTooltip, HexlyLink } from "./header-links";
import { PageAsideProvider, usePageAsideHost } from "./page-aside";
import { Sidebar } from "./sidebar";
import { ThemeToggle } from "./theme-toggle";

interface AppShellProps {
	children: ReactNode;
}

const NavigationContext = createContext<(() => void) | null>(null);

export function useAppNavigation() {
	const open = useContext(NavigationContext);
	if (!open) throw new Error("AppShell is required");
	return open;
}

function headerChrome(pathname: string, crumbs: { label: string; href?: string }[]) {
	const last = crumbs[crumbs.length - 1];
	const ancestors = crumbs.slice(0, -1);
	const title = last?.label ?? (pathname === "/" ? "Dashboard" : "X-Ray");
	const breadcrumbs = [
		...(pathname === "/" ? [] : [{ href: "/", label: "Home" }]),
		...ancestors.map((item) => ({ label: item.label, href: item.href })),
	];
	return { title, breadcrumbs };
}

function AppShellInner({ children }: AppShellProps) {
	const isMobile = useIsMobile();
	const [collapsed, setCollapsed] = useState(false);
	const [mobileOpen, setMobileOpen] = useState(false);
	const { pathname, search } = useLocation();
	const channelRoute = Boolean(
		matchPath("/channels/:channelId", pathname) ||
			matchPath("/channels/:channelId/articles/:articleId", pathname),
	);
	const immersive = channelRoute && isMobile;
	const openNavigation = useCallback(() => setMobileOpen(true), []);
	const { breadcrumbs } = useBreadcrumbs();
	const { theme } = useTheme();
	const chrome = headerChrome(pathname, breadcrumbs);
	const { setSlot, open: asideOpen } = usePageAsideHost();

	useEffect(() => {
		document.title = documentTitle(chrome.title);
		return () => {
			document.title = SITE_TITLE;
		};
	}, [chrome.title]);
	const restoreNavFocus = useRestoreDialogFocus(mobileOpen);
	useEffect(() => {
		const previous = window.history.scrollRestoration;
		window.history.scrollRestoration = "manual";
		return () => {
			window.history.scrollRestoration = previous;
		};
	}, []);
	useLayoutEffect(() => {
		void pathname;
		void search;
		if (!channelRoute) window.scrollTo({ top: 0, behavior: "instant" });
	}, [channelRoute, search, pathname]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: close drawer on route or search change
	useEffect(() => {
		setMobileOpen(false);
	}, [pathname, search]);

	useEffect(() => {
		if (!isMobile) setMobileOpen(false);
	}, [isMobile]);

	return (
		<NavigationContext.Provider value={openNavigation}>
			<BasaltAppShell layout={channelRoute ? "responsive" : "workspace"}>
				<AppSkipLink>Skip to main content</AppSkipLink>
				{!isMobile ? (
					<Sidebar collapsed={collapsed} onToggle={() => setCollapsed((v) => !v)} />
				) : (
					<Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
						<SheetContent
							side="left"
							className="w-[260px] max-w-[260px] border-0 bg-basalt-background p-0"
							onCloseAutoFocus={restoreNavFocus}
						>
							<SheetTitle className="sr-only">Navigation</SheetTitle>
							<Sidebar collapsed={false} onToggle={() => setMobileOpen(false)} />
						</SheetContent>
					</Sheet>
				)}
				<AppMain>
					{!immersive && (
						<AppHeader
							leading={
								isMobile ? (
									<HeaderTooltip label="Open navigation menu">
										<Button
											variant="ghost"
											size="icon"
											className="h-8 w-8"
											onClick={() => setMobileOpen(true)}
											aria-label="Open navigation menu"
										>
											<Menu aria-hidden="true" strokeWidth={1.5} />
										</Button>
									</HeaderTooltip>
								) : null
							}
							breadcrumbs={isMobile ? [] : chrome.breadcrumbs}
							title={chrome.title}
							actions={
								<>
									<EnvironmentSwitch />
									{!isMobile && (
										<HeaderTooltip label="GitHub repository">
											<Button variant="ghost" size="icon" className="h-8 w-8" asChild>
												<a
													href="https://github.com/nocoo/xray"
													target="_blank"
													rel="noopener noreferrer"
													aria-label="GitHub repository"
												>
													<Github aria-hidden="true" strokeWidth={1.5} />
												</a>
											</Button>
										</HeaderTooltip>
									)}
									{!isMobile && <HexlyLink />}
									<ThemeToggle aria-label={`Toggle theme (now ${theme})`} />
								</>
							}
						/>
					)}
					<div
						className={
							channelRoute
								? "flex min-h-0 min-w-0 flex-1 flex-col md:flex-row md:px-3 md:pb-3"
								: asideOpen
									? "flex min-h-0 flex-1 gap-2 px-2 pb-2 md:gap-3 md:px-3 md:pb-3"
									: "flex min-h-0 flex-1 px-2 pb-2 md:px-3 md:pb-3"
						}
					>
						<ContentIsland
							mobileSurface={channelRoute ? "edge-to-edge" : "inset"}
							className="flex min-w-0 flex-1 flex-col"
						>
							{children}
						</ContentIsland>
						{!channelRoute && (
							<div
								ref={(el) => {
									setSlot(el);
								}}
								className="flex h-full min-h-0 shrink-0"
							/>
						)}
					</div>
				</AppMain>
			</BasaltAppShell>
		</NavigationContext.Provider>
	);
}

export function AppShell({ children }: AppShellProps) {
	return (
		<BreadcrumbsProvider>
			<PageAsideProvider>
				<AppShellInner>{children}</AppShellInner>
			</PageAsideProvider>
		</BreadcrumbsProvider>
	);
}
