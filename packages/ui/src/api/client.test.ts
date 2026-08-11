import { afterEach, describe, expect, test, vi } from "vitest";
import { ApiError, apiDelete, apiGet, apiPatch, apiPost, apiPut } from "./client";

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe("api client", () => {
	test("apiGet success unwraps data", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({ success: true, data: { a: 1 } }),
			}),
		);
		await expect(apiGet<{ a: number }>("/api/x")).resolves.toEqual({ a: 1 });
	});

	test("apiGet success plain json", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({ plain: true }),
			}),
		);
		await expect(apiGet("/api/x")).resolves.toEqual({ plain: true });
	});

	test("apiGet non-ok with error body", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				ok: false,
				status: 400,
				statusText: "Bad",
				json: async () => ({ error: "nope" }),
			}),
		);
		await expect(apiGet("/api/x")).rejects.toMatchObject({ status: 400, message: "nope" });
	});

	test("apiGet non-ok non-json", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				ok: false,
				status: 502,
				statusText: "Bad Gateway",
				json: async () => {
					throw new Error("not json");
				},
			}),
		);
		await expect(apiGet("/api/x")).rejects.toBeInstanceOf(ApiError);
	});

	test("success false envelope", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({ success: false, error: "fail" }),
			}),
		);
		await expect(apiGet("/api/x")).rejects.toMatchObject({ message: "fail" });
	});

	test("network error", async () => {
		vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
		await expect(apiGet("/api/x")).rejects.toMatchObject({ status: 0 });
	});

	test("mutations", async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({ success: true, data: { ok: true } }),
		});
		vi.stubGlobal("fetch", fetchMock);
		await apiPost("/api/x", { a: 1 });
		await apiPost("/api/x");
		await apiPatch("/api/x", { a: 2 });
		await apiPut("/api/x", { a: 3 });
		await apiDelete("/api/x");
		expect(fetchMock).toHaveBeenCalledTimes(5);
		expect(fetchMock.mock.calls[0]?.[1]?.method).toBe("POST");
		expect(fetchMock.mock.calls[4]?.[1]?.method).toBe("DELETE");
	});

	test("503 message and empty error fallback", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				ok: false,
				status: 503,
				statusText: "Unavailable",
				json: async () => ({}),
			}),
		);
		await expect(apiGet("/api/x")).rejects.toMatchObject({
			message: expect.stringMatching(/Worker unreachable|503/),
		});
	});

	test("success false without error field", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({ success: false }),
			}),
		);
		await expect(apiGet("/api/x")).rejects.toMatchObject({ message: "request failed" });
	});

	test("network non-Error throw", async () => {
		vi.stubGlobal("fetch", vi.fn().mockRejectedValue("boom"));
		await expect(apiGet("/api/x")).rejects.toMatchObject({ status: 0 });
	});
});
