import { Button } from "@nocoo/basalt/components/button";
import { LoadingScreen } from "@nocoo/basalt/components/loading-screen";
import type { ReactNode } from "react";
import { MeProvider } from "@/hooks/me-context";
import { useMe } from "@/hooks/use-me";

function XrayMark({ className }: { className?: string }) {
	return <img src="/logo-24.png" alt="" width={32} height={32} className={className} />;
}

function IdentityBadge({
	title,
	description,
	action,
}: {
	title: string;
	description: string;
	action?: ReactNode;
}) {
	return (
		<div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-basalt-background p-4">
			<div className="flex flex-col items-center">
				<div
					data-basalt-surface-root=""
					className="relative flex aspect-[54/86] w-72 flex-col overflow-hidden rounded-2xl bg-basalt-card ring-1 ring-black/[0.08] dark:ring-white/[0.06]"
					style={{
						boxShadow: [
							"0 1px 2px rgba(0,0,0,0.06)",
							"0 4px 8px rgba(0,0,0,0.04)",
							"0 12px 24px rgba(0,0,0,0.06)",
							"0 24px 48px rgba(0,0,0,0.04)",
							"0 0 0 0.5px rgba(0,0,0,0.02)",
							"0 0 60px rgba(0,0,0,0.03)",
						].join(", "),
					}}
				>
					<div className="bg-basalt-primary px-5 py-4">
						<div className="flex items-center justify-between">
							<div className="h-4 w-8 rounded-full bg-basalt-background/80" />
							<div className="flex items-center gap-2">
								<img src="/logo-24.png" alt="" width={16} height={16} />
								<span className="text-sm font-semibold text-basalt-primary-foreground">X-Ray</span>
							</div>
							<span className="text-[10px] font-medium tracking-widest text-basalt-primary-foreground/60 uppercase">
								Access
							</span>
						</div>
					</div>
					<div className="flex flex-1 flex-col items-center px-6 pt-6 pb-14">
						<div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-full bg-basalt-secondary p-2.5 ring-1 ring-basalt-border">
							<img src="/logo-80.png" alt="X-Ray" width={80} height={80} />
						</div>
						<p className="mt-5 text-lg font-semibold text-basalt-foreground">{title}</p>
						<p className="mt-1 text-center text-xs text-basalt-muted-foreground">{description}</p>
						<div className="mt-5 h-px w-full bg-basalt-border" />
						<div className="flex-1" />
						{action}
					</div>
					<div className="absolute right-0 bottom-0 left-0 flex items-center justify-center border-t border-basalt-border bg-basalt-secondary/50 py-2.5">
						<span className="text-[10px] text-basalt-muted-foreground">Cloudflare Access</span>
					</div>
				</div>
			</div>
		</div>
	);
}

export function SessionGate({ children }: { children: ReactNode }) {
	const me = useMe();

	if (me.status === "loading") {
		return <LoadingScreen label="Loading session" mark={<XrayMark className="h-8 w-8" />} />;
	}

	if (me.status === "unauthenticated") {
		return (
			<IdentityBadge
				title="Sign in required"
				description={
					me.error ??
					"Cloudflare Access session missing. Locally enable AUTH_DEV_BYPASS on the worker."
				}
			/>
		);
	}

	if (me.status === "error") {
		return (
			<IdentityBadge
				title="Session error"
				description={me.error}
				action={
					<Button
						variant="secondary"
						className="w-full rounded-xl py-3"
						onClick={() => me.refresh()}
					>
						Retry
					</Button>
				}
			/>
		);
	}

	return <MeProvider user={me.user}>{children}</MeProvider>;
}
