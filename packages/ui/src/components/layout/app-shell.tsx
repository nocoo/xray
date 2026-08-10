import { Menu } from "lucide-react";
import { type ReactNode, useEffect, useRef } from "react";
import { useLocation } from "react-router";
import { Github } from "@/components/icons/github";
import { useIsMobile } from "@/hooks/use-mobile";
import { Breadcrumbs } from "./breadcrumbs";
import { BreadcrumbsProvider, useBreadcrumbs } from "./breadcrumbs-context";
import { Sidebar } from "./sidebar";
import { SidebarProvider, useSidebar } from "./sidebar-context";
import { ThemeToggle } from "./theme-toggle";

const FOCUSABLE =
	'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

interface AppShellProps {
	children: ReactNode;
}

function AppShellInner({ children }: AppShellProps) {
	const isMobile = useIsMobile();
	const { mobileOpen, setMobileOpen } = useSidebar();
	const { pathname } = useLocation();
	const { breadcrumbs } = useBreadcrumbs();
	const drawerRef = useRef<HTMLDivElement>(null);
	const openButtonRef = useRef<HTMLButtonElement>(null);
	const previouslyFocused = useRef<HTMLElement | null>(null);

	// biome-ignore lint/correctness/useExhaustiveDependencies: close drawer on route change
	useEffect(() => {
		setMobileOpen(false);
	}, [pathname, setMobileOpen]);

	useEffect(() => {
		if (drawerOpen) {
			document.body.style.overflow = "hidden";
		} else {
			document.body.style.overflow = "";
		}
		return () => {
			document.body.style.overflow = "";
		};
	}, [drawerOpen]);

	// Focus trap + Escape + restore focus (S12R-03)
	useEffect(() => {
		if (!drawerOpen) return;
		const drawer = drawerRef.current;
		if (!drawer) return;

		previouslyFocused.current = document.activeElement as HTMLElement | null;
		const nodes = [...drawer.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
			(el) => !el.hasAttribute("disabled") && el.tabIndex !== -1,
		);
		const first = nodes[0];
		const last = nodes[nodes.length - 1];
		first?.focus();

		const onKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				e.preventDefault();
				setMobileOpen(false);
				return;
			}
			if (e.key !== "Tab" || nodes.length === 0) return;
			if (e.shiftKey) {
				if (document.activeElement === first) {
					e.preventDefault();
					last?.focus();
				}
			} else if (document.activeElement === last) {
				e.preventDefault();
				first?.focus();
			}
		};

		document.addEventListener("keydown", onKeyDown);
		return () => {
			document.removeEventListener("keydown", onKeyDown);
			const restore = previouslyFocused.current ?? openButtonRef.current;
			restore?.focus();
		};
	}, [drawerOpen, setMobileOpen]);

	const resolved = isMobile !== undefined;
	const mobile = isMobile === true;
	const drawerOpen = mobile && mobileOpen;

	// Leave mobile breakpoint → close drawer (S12R2-01)
	useEffect(() => {
		if (resolved && !mobile && mobileOpen) {
			setMobileOpen(false);
		}
	}, [resolved, mobile, mobileOpen, setMobileOpen]);

	return (
		<div className="flex min-h-screen w-full bg-background">
			<div
				className={resolved && mobile ? "hidden" : "hidden md:block"}
				inert={drawerOpen || undefined}
			>
				<Sidebar />
			</div>

			{drawerOpen && (
				<>
					<button
						type="button"
						tabIndex={-1}
						aria-label="Close navigation menu"
						className="fixed inset-0 z-40 bg-black/50 backdrop-blur-xs"
						onClick={() => setMobileOpen(false)}
					/>
					<div
						ref={drawerRef}
						className="fixed inset-y-0 left-0 z-50 w-[260px]"
						role="dialog"
						aria-modal="true"
						aria-label="Main navigation drawer"
					>
						<Sidebar mobile />
					</div>
				</>
			)}

			<main
				className="flex min-h-screen min-w-0 flex-1 flex-col"
				inert={drawerOpen ? true : undefined}
			>
				<header className="flex h-14 shrink-0 items-center justify-between px-4 md:px-6">
					<div className="flex items-center gap-3">
						<button
							ref={openButtonRef}
							type="button"
							onClick={() => setMobileOpen(true)}
							aria-label="Open navigation menu"
							aria-expanded={drawerOpen}
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
