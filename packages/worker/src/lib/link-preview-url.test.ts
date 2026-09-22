import { afterEach, describe, expect, test, vi } from "vitest";
import { hasPublicDns, isPublicAddress, publicPreviewUrl } from "./link-preview-url.js";

afterEach(() => vi.unstubAllGlobals());

describe("public preview destinations", () => {
	test.each([
		"",
		"not a URL",
		"http://example.com",
		"ftp://example.com",
		"https://user@example.com",
		"https://user:pass@example.com",
		"https://example.com:8443",
		"https://localhost",
		"https://foo.localhost.",
		"https://foo.local",
		"https://foo.internal",
		"https://foo.intranet",
		"https://host.lan",
		"https://host.home",
		"https://host.corp",
		"https://foo.test",
		"https://foo.invalid",
		"https://foo.example",
		"https://foo.onion",
		"https://home.arpa",
		"https://127.0.0.1",
		"https://2130706433",
		"https://0x7f000001",
		"https://0177.0.0.1",
		"https://127.1",
		"https://%31%32%37.0.0.1",
		"https://[::1]",
		"https://[::ffff:127.0.0.1]",
		"https://[2606:4700:4700::1111]",
		"https://8.8.8.8",
		"https://foo_bar.com",
		"https://foo..com",
		"https://-foo.com",
		"https://foo-.com",
	])("rejects %s", (raw) => expect(publicPreviewUrl(raw)).toBeNull());
	test("accepts public DNS names on HTTPS 443 and resolves safe relative images", () => {
		expect(publicPreviewUrl("https://EXAMPLE.com.:443/path#fragment")?.href).toBe(
			"https://example.com/path",
		);
		expect(publicPreviewUrl("../image.png", "https://example.com/path/page")?.href).toBe(
			"https://example.com/image.png",
		);
	});
	test.each([
		"0.0.0.0",
		"10.0.0.1",
		"127.1.2.3",
		"224.0.0.1",
		"255.255.255.255",
		"100.64.0.1",
		"100.127.255.255",
		"169.254.169.254",
		"172.16.0.1",
		"172.31.0.1",
		"192.0.2.1",
		"192.168.1.1",
		"192.88.99.1",
		"198.18.0.1",
		"198.19.0.1",
		"198.51.100.1",
		"203.0.113.1",
		"999.1.1.1",
		"bad",
		"::",
		"::1",
		"::ffff:8.8.8.8",
		"fc00::1",
		"fe80::1",
		"ff02::1",
		"2001:db8::1",
		"2001::1",
		"2002:808:808::1",
		"3fff::1",
	])("rejects reserved DNS answer %s", (ip) => expect(isPublicAddress(ip)).toBe(false));
	test.each([
		"1.1.1.1",
		"93.184.216.34",
		"100.63.255.255",
		"100.128.0.1",
		"172.15.0.1",
		"172.32.0.1",
		"192.1.0.1",
		"192.88.98.1",
		"198.51.99.1",
		"203.0.112.1",
		"2606:4700:4700::1111",
		"2001:4860:4860::8888",
		"3ffe::1",
	])("allows public address %s", (ip) => expect(isPublicAddress(ip)).toBe(true));
	test("checks both DNS families and rejects mixed public/private answers or local CNAME", async () => {
		const fetcher = vi.fn();
		vi.stubGlobal("fetch", fetcher);
		const check = (Answer?: object[]) => {
			fetcher.mockImplementation(async () => Response.json({ Status: 0, Answer }));
			return hasPublicDns(new URL("https://example.com"), new AbortController().signal);
		};
		expect(
			await check([
				{ type: 1, data: "1.1.1.1" },
				{ type: 28, data: "2606:4700::1" },
				{ type: 5, data: "cdn.example.com." },
			]),
		).toBe(true);
		expect(fetcher).toHaveBeenCalledTimes(2);
		const types = fetcher.mock.calls.map(([url]) => url.searchParams.get("type"));
		expect(types).toEqual(["A", "AAAA"]);
		expect(
			await check([
				{ type: 1, data: "1.1.1.1" },
				{ type: 28, data: "::1" },
			]),
		).toBe(false);
		expect(
			await check([
				{ type: 1, data: "1.1.1.1" },
				{ type: 5, data: "localhost." },
			]),
		).toBe(false);
		expect(await check()).toBe(false);
		fetcher.mockResolvedValue(new Response(null, { status: 503 }));
		await expect(
			hasPublicDns(new URL("https://example.com"), new AbortController().signal),
		).rejects.toThrow("DNS unavailable");
		fetcher.mockImplementation(async () => Response.json({ Status: 3 }));
		await expect(
			hasPublicDns(new URL("https://example.com"), new AbortController().signal),
		).rejects.toThrow("DNS unavailable");
	});
});
