import { afterEach, expect, test, vi } from "vitest";
import { apiPath, getDataMode, selectDataMode } from "./data-mode";

afterEach(() => {
	sessionStorage.clear();
	vi.unstubAllEnvs();
	vi.restoreAllMocks();
});

test("local sessions default to mock and keep requests on the local API", () => {
	expect(getDataMode()).toBe("mock");
	expect(apiPath("/api/dashboard")).toBe("/api/dashboard");
	sessionStorage.setItem("xray:data-mode", "invalid");
	expect(getDataMode()).toBe("mock");
});

test("switching sources reloads the root to discard previous tenant state", () => {
	const navigate = vi.spyOn(window.location, "assign").mockImplementation(() => {});
	selectDataMode("invalid");
	expect(navigate).not.toHaveBeenCalled();
	selectDataMode("product");
	expect(getDataMode()).toBe("product");
	expect(apiPath("/api/watchlists/1/items?limit=2")).toBe(
		"/__product/api/watchlists/1/items?limit=2",
	);
	expect(navigate).toHaveBeenCalledWith("/");
	selectDataMode("mock");
	expect(getDataMode()).toBe("mock");
});

test("production builds always use their own API regardless of local preference", () => {
	vi.stubEnv("DEV", false);
	sessionStorage.setItem("xray:data-mode", "mock");
	expect(getDataMode()).toBe("product");
	expect(apiPath("/api/dashboard")).toBe("/api/dashboard");
});
