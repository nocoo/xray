import type { ReactNode } from "react";
import { useMe } from "@/hooks/use-me";

export function SessionGate({ children }: { children: ReactNode }) {
	const me = useMe();

	if (me.status === "loading") {
		return (
			<div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">
				Loading session…
			</div>
		);
	}

	if (me.status === "unauthenticated") {
		return (
			<div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background px-6 text-center">
				<h1 className="font-display text-xl font-semibold">Sign in required</h1>
				<p className="max-w-md text-sm text-muted-foreground">
					{me.error ??
						"Cloudflare Access session missing. Locally enable AUTH_DEV_BYPASS on the worker."}
				</p>
			</div>
		);
	}

	if (me.status === "error") {
		return (
			<div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background px-6 text-center">
				<h1 className="font-display text-xl font-semibold">Session error</h1>
				<p className="max-w-md text-sm text-muted-foreground">{me.error}</p>
				<button
					type="button"
					className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground"
					onClick={() => me.refresh()}
				>
					Retry
				</button>
			</div>
		);
	}

	return <>{children}</>;
}
