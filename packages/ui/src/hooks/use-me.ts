import { useCallback, useEffect, useState } from "react";
import { ApiError } from "@/api/client";
import { fetchMe, type MeUser } from "@/api/me";

export type MeState =
	| { status: "loading" }
	| { status: "authenticated"; user: MeUser }
	| { status: "unauthenticated"; error?: string }
	| { status: "error"; error: string };

export function useMe(): MeState & { refresh: () => void } {
	const [state, setState] = useState<MeState>({ status: "loading" });
	const [tick, setTick] = useState(0);

	const refresh = useCallback(() => setTick((t) => t + 1), []);

	// biome-ignore lint/correctness/useExhaustiveDependencies: tick forces refresh
	useEffect(() => {
		let cancelled = false;
		setState({ status: "loading" });
		fetchMe()
			.then((res) => {
				if (cancelled) return;
				if (res.authenticated && res.user) {
					setState({ status: "authenticated", user: res.user });
				} else {
					setState({ status: "unauthenticated" });
				}
			})
			.catch((e: unknown) => {
				if (cancelled) return;
				if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
					setState({ status: "unauthenticated", error: e.message });
					return;
				}
				const msg = e instanceof Error ? e.message : String(e);
				setState({ status: "error", error: msg });
			});
		return () => {
			cancelled = true;
		};
	}, [tick]);

	return { ...state, refresh };
}
