import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { DataModeSwitch } from "./data-mode-switch";

afterEach(() => {
	cleanup();
	sessionStorage.clear();
	vi.restoreAllMocks();
	vi.unstubAllEnvs();
});

test("MOCK and PROD display exact labels while persisting lowercase mode values", () => {
	const navigate = vi.spyOn(window.location, "assign").mockImplementation(() => {});
	const view = render(<DataModeSwitch />);
	expect(screen.getByRole("radio", { name: "MOCK" }).getAttribute("aria-checked")).toBe("true");
	fireEvent.click(screen.getByRole("radio", { name: "PROD" }));
	expect(sessionStorage.getItem("xray:data-mode")).toBe("product");
	expect(navigate).toHaveBeenCalledWith("/");
	view.rerender(<DataModeSwitch />);
	expect(screen.getByRole("radio", { name: "PROD" }).getAttribute("aria-checked")).toBe("true");
	fireEvent.click(screen.getByRole("radio", { name: "MOCK" }));
	expect(sessionStorage.getItem("xray:data-mode")).toBe("mock");
	expect(screen.queryByRole("radio", { name: "Product" })).toBeNull();
});

test("production builds do not expose the local mode switch", () => {
	vi.stubEnv("DEV", false);
	render(<DataModeSwitch />);
	expect(screen.queryByRole("radio")).toBeNull();
});
