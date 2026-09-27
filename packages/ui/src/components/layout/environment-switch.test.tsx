import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { LocalEnvironment } from "@/lib/environment";

const ready: LocalEnvironment = {
	local: true,
	mode: "demo",
	locked: false,
	automated: false,
	instanceId: "demo-one",
	csrfToken: "csrf-one",
	ingestBase: "http://127.0.0.1:42001",
};
beforeEach(() => {
	vi.resetModules();
	window.__XRAY_LOCAL__ = true;
	localStorage.clear();
});
afterEach(() => {
	cleanup();
	delete window.__XRAY_LOCAL__;
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});
async function setup(descriptor: LocalEnvironment = ready) {
	const fetcher = vi.fn().mockResolvedValueOnce(Response.json(descriptor));
	vi.stubGlobal("fetch", fetcher);
	const { initializeEnvironment } = await import("@/lib/environment");
	await initializeEnvironment();
	const { EnvironmentSwitch } = await import("./environment-switch");
	return { fetcher, view: render(<EnvironmentSwitch />) };
}

test("local control has precisely Demo, E2E, Prod with an accessible hidden legend and accepted switch", async () => {
	const { fetcher } = await setup();
	const navigate = vi.spyOn(window.location, "assign").mockImplementation(() => {});
	fetcher.mockResolvedValueOnce(Response.json({ ...ready, mode: "prod", instanceId: "prod-two" }));
	expect(screen.getByRole("group", { name: "Environment" })).toBeTruthy();
	expect(screen.getAllByRole("radio").map((button) => button.textContent)).toEqual([
		"Demo",
		"E2E",
		"Prod",
	]);
	expect(screen.getByRole("radio", { name: "Demo" }).getAttribute("aria-checked")).toBe("true");
	fireEvent.click(screen.getByRole("radio", { name: "Prod" }));
	await waitFor(() => expect(navigate).toHaveBeenCalledWith("/"));
	expect(localStorage.getItem("xray:environment-mode")).toBe("prod");
});

test("E2E lock shows selection and disables both alternatives", async () => {
	const { fetcher } = await setup({ ...ready, mode: "e2e", locked: true });
	for (const name of ["Demo", "Prod"]) {
		const button = screen.getByRole("radio", { name }) as HTMLButtonElement;
		expect(button.disabled).toBe(true);
		fireEvent.click(button);
	}
	expect(screen.getByRole("radio", { name: "E2E" }).getAttribute("aria-checked")).toBe("true");
	expect(fetcher).toHaveBeenCalledOnce();
});

test("cloud CI initializes its fixed target but hides control", async () => {
	await setup({ ...ready, mode: "e2e", locked: true, automated: true, local: false });
	expect(screen.queryByRole("group", { name: "Environment" })).toBeNull();
	expect(localStorage.getItem("xray:environment-mode")).toBeNull();
});

test("hosted page ignores stored selection and has no control", async () => {
	delete window.__XRAY_LOCAL__;
	localStorage.setItem("xray:environment-mode", "prod");
	const { fetcher } = await setup();
	expect(screen.queryByRole("group", { name: "Environment" })).toBeNull();
	expect(fetcher).not.toHaveBeenCalled();
});

test("cancelled switch keeps the article editor and its unsaved content", async () => {
	const { fetcher } = await setup();
	const { useUnsavedDraft } = await import("@/hooks/use-unsaved-draft");
	function Draft() {
		useUnsavedDraft(true);
		return <div>Unsaved article draft</div>;
	}
	render(<Draft />);
	fireEvent.click(screen.getByRole("radio", { name: "Prod" }));
	await screen.findByText("Discard unsaved changes?");
	fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
	await waitFor(() =>
		expect((screen.getByRole("radio", { name: "Prod" }) as HTMLButtonElement).disabled).toBe(false),
	);
	expect(screen.getByText("Unsaved article draft")).toBeTruthy();
	expect(fetcher).toHaveBeenCalledOnce();
	expect(localStorage.getItem("xray:environment-mode")).toBeNull();
});

test("failed switch stays selected and exposes error with retry available", async () => {
	const { fetcher } = await setup();
	fetcher.mockRejectedValueOnce(new Error("Launcher stopped"));
	fireEvent.click(screen.getByRole("radio", { name: "E2E" }));
	await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("Launcher stopped"));
	expect(screen.getByRole("radio", { name: "Demo" }).getAttribute("aria-checked")).toBe("true");
	fetcher.mockRejectedValueOnce("Connection lost");
	fireEvent.click(screen.getByRole("radio", { name: "E2E" }));
	await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("Connection lost"));
});
