import { readResponseBounded } from "./ai-endpoint.js";

export function publicPreviewUrl(raw: string, base?: string): URL | null {
	try {
		const url = new URL(raw, base);
		const host = url.hostname.replace(/\.$/, "");
		if (
			url.protocol !== "https:" ||
			url.port ||
			url.username ||
			url.password ||
			host.includes(":") ||
			/^[\d.]+$/.test(host) ||
			!host.includes(".") ||
			!/^[a-z0-9.-]+$/.test(host) ||
			host.split(".").some((label) => !label || label.startsWith("-") || label.endsWith("-")) ||
			/(?:^|\.)(localhost|local|internal|intranet|lan|home|corp|test|invalid|example|onion|arpa)$/.test(
				host,
			)
		)
			return null;
		url.hostname = host;
		url.hash = "";
		return url;
	} catch {
		return null;
	}
}

export function isPublicAddress(address: string): boolean {
	if (/^\d+\.\d+\.\d+\.\d+$/.test(address)) {
		const parts = address.split(".").map(Number);
		if (parts.some((n) => n > 255)) return false;
		const [a, b, c] = parts as [number, number, number, number];
		return !(
			a === 0 ||
			a === 10 ||
			a === 127 ||
			a >= 224 ||
			(a === 100 && b >= 64 && b <= 127) ||
			(a === 169 && b === 254) ||
			(a === 172 && b >= 16 && b <= 31) ||
			(a === 192 && (b === 0 || b === 168 || (b === 88 && c === 99))) ||
			(a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
			(a === 203 && b === 0 && c === 113)
		);
	}
	if (!URL.canParse(`https://[${address}]/`)) return false;
	const host = new URL(`https://[${address}]/`).hostname.slice(1, -1);
	const first = Number.parseInt(host.split(":")[0] ?? "", 16);
	const second = Number.parseInt(host.split(":")[1] || "0", 16);
	return (
		first >= 0x2000 &&
		first <= 0x3fff &&
		first !== 0x2002 &&
		!(first === 0x2001 && (second < 0x200 || second === 0xdb8)) &&
		!(first === 0x3fff && second < 0x1000)
	);
}

export async function hasPublicDns(url: URL, signal: AbortSignal): Promise<boolean> {
	const results = await Promise.all(
		["A", "AAAA"].map(async (type) => {
			const resolver = new URL("https://cloudflare-dns.com/dns-query");
			resolver.searchParams.set("name", url.hostname);
			resolver.searchParams.set("type", type);
			const response = await fetch(resolver, {
				headers: { Accept: "application/dns-json" },
				redirect: "manual",
				signal,
			});
			if (!response.ok) throw new Error("DNS unavailable");
			const data = JSON.parse(await readResponseBounded(response, 32768)) as {
				Status?: number;
				Answer?: { type: number; data: string }[];
			};
			if (data.Status !== 0) throw new Error("DNS unavailable");
			return data.Answer ?? [];
		}),
	);
	const records = results.flat();
	const addresses = records.filter((record) => record.type === 1 || record.type === 28);
	return (
		addresses.length > 0 &&
		addresses.every((record) => isPublicAddress(record.data)) &&
		records.every(
			(record) => record.type !== 5 || publicPreviewUrl(`https://${record.data}/`) !== null,
		)
	);
}
