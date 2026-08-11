import { afterEach, describe, expect, test, vi } from "vitest";
import * as zhetoApi from "@/api/zheto";
import { canSaveToZheto, postZhetoSave, xStatusUrl } from "./zheto-save";

describe("zheto save helpers", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	test("canSaveToZheto requires https", () => {
		expect(canSaveToZheto("https://example.com/a")).toBe(true);
		expect(canSaveToZheto("http://example.com/a")).toBe(false);
		expect(canSaveToZheto(null)).toBe(false);
		expect(canSaveToZheto("not-a-url")).toBe(false);
	});

	test("xStatusUrl", () => {
		expect(xStatusUrl("123")).toBe("https://x.com/i/status/123");
	});

	test("postZhetoSave delegates to api client", async () => {
		const spy = vi.spyOn(zhetoApi, "zhetoSave").mockResolvedValue({
			shortUrl: "https://zhe.to/a",
			slug: "a",
			originalUrl: "https://example.com",
			isExisting: false,
		});
		const ok = await postZhetoSave({ url: "https://example.com", note: "n" });
		expect(ok).toEqual({ ok: true });
		expect(spy).toHaveBeenCalledWith({ url: "https://example.com", note: "n" });

		spy.mockRejectedValueOnce(new Error("boom"));
		const fail = await postZhetoSave({ url: "https://example.com" });
		expect(fail).toEqual({ ok: false, error: "boom" });

		spy.mockRejectedValueOnce("raw");
		const fail2 = await postZhetoSave({ url: "https://example.com" });
		expect(fail2).toEqual({ ok: false, error: "raw" });
	});
});
