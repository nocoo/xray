import { Menu } from "lucide-react";
import { type ReactNode, useEffect } from "react";
import { useLocation } from "react-router";
import { Github } from "@/components/icons/github";
import { useIsMobile } from "@/hooks/use-mobile";
import { Breadcrumbs } from "./breadcrumbs";
import { BreadcrumbsProvider, useBreadcrumbs } from "./breadcrumbs-context";
import { Sidebar } from "./sidebar";
import { SidebarProvider, useSidebar } from "./sidebar-context";
import { ThemeToggle } from "./theme-toggle";

interface AppShellProps {
	children: ReactNode;
}

function AppShellInner({ children }: AppShellProps) {
	const isMobile = useIsMobile();
	const { mobileOpen, setMobileOpen } = useSidebar();
	const { pathname } = useLocation();
	const { breadcrumbs } = useBreadcrumbs();

	// biome-ignore lint/correctness/useExhaustiveDependencies: close drawer on route change
	useEffect(() => {
		setMobileOpen(false);
	}, [pathname, setMobileOpen]);

	useEffect(() => {
		if (mobileOpen) {
			document.body.style.overflow = "hidden";
		} else {
			document.body.style.overflow = "";
		}
		return () => {
			document.body.style.overflow = "";
		};
	}, [mobileOpen]);

	// Escape closes mobile drawer (S12-05)
	useEffect(() => {
		if (!mobileOpen) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") setMobileOpen(false);
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [mobileOpen, setMobileOpen]);

	const resolved = isMobile !== undefined;
	const mobile = isMobile === true;

	return (
		<div className="flex min-h-screen w-full bg-background">
			<div className={resolved && mobile ? "hidden" : "hidden md:block"}>
				<Sidebar />
			</div>

			{mobile && mobileOpen && (
				<>
					<button
						type="button"
						aria-label="Close navigation menu"
						className="fixed inset-0 z-40 bg-black/50 backdrop-blur-xs"
						onClick={() => setMobileOpen(false)}
					/>
					<div
						className="fixed inset-y-0 left-0 z-50 w-[260px]"
						role="dialog"
						aria-modal="true"
						aria-label="Main navigation drawer"
					>
						<Sidebar mobile />
					</div>
				</>
			)}

			<main className="flex min-h-screen min-w-0 flex-1 flex-col">
				<header className="flex h-14 shrink-0 items-center justify-between px-4 md:px-6">
					<div className="flex items-center gap-3">
						<button
							type="button"
							onClick={() => setMobileOpen(true)}
							aria-label="Open navigation menu"
							aria-expanded={mobileOpen}
							className={`flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground ${
								resolved && !mobile ? "md:hidden" : mobile ? "" : "md:hidden"
							}`}
						>
							<Menu className="h-5 w-5" aria-hidden="true" strokeWidth={1.5} />
						</button>
						<Breadcrumbs items={[{ label: "Home", href: "/" }, ...breadcrumbs]} />
					</div>
					<div className="flex items-center gap-1">
						<a
							href="https://github.com/nocoo/xray"
							target="_blank"
							rel="noopener noreferrer"
							aria-label="GitHub repository"
							className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
						>
							<Github className="h-[18px] w-[18px]" aria-hidden="true" strokeWidth={1.5} />
						</a>
						<ThemeToggle />
					</div>
				</header>

				<div className="flex-1 px-2 pb-2 md:px-3 md:pb-3">
					<div className="h-full overflow-y-auto rounded-[16px] bg-card p-3 md:rounded-[20px] md:p-5">
						{children}
					</div>
				</div>
			</main>
		</div>
	);
}

export function AppShell({ children }: AppShellProps) {
	return (
		<SidebarProvider>
			<BreadcrumbsProvider>
				<AppShellInner>{children}</AppShellInner>
			</BreadcrumbsProvider>
		</SidebarProvider>
	);
}
