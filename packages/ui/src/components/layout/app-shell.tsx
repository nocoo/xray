import { Button, ContentIsland, Sheet, SheetContent, SheetTitle, ThemeToggle } from "@nocoo/basalt";
import { AppHeader } from "@nocoo/basalt/components/app-header";
import {
	AppMain,
	AppSkipLink,
	AppShell as BasaltAppShell,
} from "@nocoo/basalt/components/app-shell";
import { useTheme } from "@nocoo/basalt/providers/theme";
import { Menu } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { useLocation } from "react-router";
import { Github } from "@/components/icons/github";
import { useRestoreDialogFocus } from "@/hooks/restore-dialog-focus";
import { useIsMobile } from "@/hooks/use-mobile";
import { BreadcrumbsProvider, useBreadcrumbs } from "./breadcrumbs-context";
import { PageAsideProvider, usePageAsideHost } from "./page-aside";
import { Sidebar } from "./sidebar";

interface AppShellProps {
	children: ReactNode;
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
	const { breadcrumbs } = useBreadcrumbs();
	const { theme } = useTheme();
	const chrome = headerChrome(pathname, breadcrumbs);
	const { setSlot, open: asideOpen } = usePageAsideHost();
	const restoreNavFocus = useRestoreDialogFocus(mobileOpen);

	// biome-ignore lint/correctness/useExhaustiveDependencies: close drawer on route or search change
	useEffect(() => {
		setMobileOpen(false);
	}, [pathname, search]);

	useEffect(() => {
		if (!isMobile) setMobileOpen(false);
	}, [isMobile]);

	useEffect(() => {
		document.body.style.overflow = mobileOpen ? "hidden" : "";
		return () => {
			document.body.style.overflow = "";
		};
	}, [mobileOpen]);

	return (
		<BasaltAppShell>
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
				<AppHeader
					leading={
						isMobile ? (
							<Button
								variant="ghost"
								size="icon"
								className="h-8 w-8"
								onClick={() => setMobileOpen(true)}
								aria-label="Open navigation menu"
							>
								<Menu aria-hidden="true" strokeWidth={1.5} />
							</Button>
						) : null
					}
					breadcrumbs={chrome.breadcrumbs}
					title={chrome.title}
					actions={
						<>
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
							<ThemeToggle aria-label={`Toggle theme (now ${theme})`} />
						</>
					}
				/>
				<div
					className={
						asideOpen
							? "flex min-h-0 flex-1 gap-2 px-2 pb-2 md:gap-3 md:px-3 md:pb-3"
							: "flex min-h-0 flex-1 px-2 pb-2 md:px-3 md:pb-3"
					}
				>
					<ContentIsland className="flex min-w-0 flex-1 flex-col">{children}</ContentIsland>
					<div
						ref={(el) => {
							setSlot(el);
						}}
						className="flex h-full min-h-0 shrink-0"
					/>
				</div>
			</AppMain>
		</BasaltAppShell>
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
