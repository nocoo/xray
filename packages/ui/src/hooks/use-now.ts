import { useEffect, useState } from "react";

/**
 * Wall-clock tick so relative timestamps (post time → now) stay fresh while the
 * page stays open. Defaults to 30s — fine for "5m" / "3h" UI granularity.
 */
export function useNow(intervalMs = 30_000): number {
	const [now, setNow] = useState(() => Date.now());
	useEffect(() => {
		const id = window.setInterval(() => setNow(Date.now()), intervalMs);
		return () => window.clearInterval(id);
	}, [intervalMs]);
	return now;
}
