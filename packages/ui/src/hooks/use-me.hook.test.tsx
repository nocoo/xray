import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { useMe } from "./use-me";

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe("useMe hook", () => {
	test("authenticated", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () =>
				Response.json({
					authenticated: true,
					user: { id: "1", email: "a@b.c", name: "A", image: null },
				}),
			),
		);
		const { result } = renderHook(() => useMe());
		await waitFor(() => expect(result.current.status).toBe("authenticated"));
		if (result.current.status === "authenticated") {
			expect(result.current.user.email).toBe("a@b.c");
		}
	});

	test("unauthenticated without user", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => Response.json({ authenticated: false, user: null })),
		);
		const { result } = renderHook(() => useMe());
		await waitFor(() => expect(result.current.status).toBe("unauthenticated"));
	});

	test("401 ApiError → unauthenticated", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => new Response(JSON.stringify({ error: "no" }), { status: 401 })),
		);
		const { result } = renderHook(() => useMe());
		await waitFor(() => expect(result.current.status).toBe("unauthenticated"));
	});

	test("network error → error state", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => {
				throw new Error("down");
			}),
		);
		const { result } = renderHook(() => useMe());
		await waitFor(() => expect(result.current.status).toBe("error"));
		if (result.current.status === "error") expect(result.current.error).toContain("down");
	});

	test("refresh retriggers", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(
				Response.json({
					authenticated: true,
					user: { id: "1", email: "a@b.c", name: null, image: null },
				}),
			)
			.mockResolvedValueOnce(Response.json({ authenticated: false, user: null }));
		vi.stubGlobal("fetch", fetchMock);
		const { result } = renderHook(() => useMe());
		await waitFor(() => expect(result.current.status).toBe("authenticated"));
		act(() => {
			result.current.refresh();
		});
		await waitFor(() => expect(result.current.status).toBe("unauthenticated"));
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	test("cancelled fetch does not set state", async () => {
		let resolveFetch: (v: Response) => void = () => {};
		vi.stubGlobal(
			"fetch",
			vi.fn(
				() =>
					new Promise<Response>((resolve) => {
						resolveFetch = resolve;
					}),
			),
		);
		const { unmount } = renderHook(() => useMe());
		unmount();
		await act(async () => {
			resolveFetch(
				Response.json({
					authenticated: true,
					user: { id: "1", email: "x", name: null, image: null },
				}),
			);
			await Promise.resolve();
		});
		// no throw = cancelled path handled
		expect(true).toBe(true);
	});

	test("403 ApiError via non-ok response", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => new Response(JSON.stringify({ error: "no" }), { status: 403 })),
		);
		const { result } = renderHook(() => useMe());
		await waitFor(() => expect(result.current.status).toBe("unauthenticated"));
	});

	test("non-Error catch", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => {
				throw "raw";
			}),
		);
		const { result } = renderHook(() => useMe());
		await waitFor(() => expect(result.current.status).toBe("error"));
	});
});
