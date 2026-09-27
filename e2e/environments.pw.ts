import { expect, test } from "@playwright/test";
import { installExternalMedia } from "../fixtures/e2e";
import { startLocalServer } from "../packages/ui/dev/local-server";
import { BROWSER } from "./helpers";

test.beforeEach(async ({ page }) => { await installExternalMedia(page); });

test("manual E2E startup exposes enabled alternatives without changing saved preferences", async ({ page }) => {
	const app = await startLocalServer({ mode: "e2e", port: 0, built: true });
	try {
		await page.addInitScript(() => localStorage.setItem("xray:environment-mode", "demo"));
		await page.goto(app.url);
		await expect(page.getByRole("heading", { name: "Dashboard", exact: true }).last()).toBeVisible();
		expect(app.descriptor()).toMatchObject({ mode: "e2e", locked: false, automated: false });
		await expect(page.getByRole("radio", { name: "E2E", exact: true })).toBeChecked();
		for (const name of ["Demo", "Prod"])
			await expect(page.getByRole("radio", { name, exact: true })).toBeEnabled();
		expect(await page.evaluate(() => localStorage.getItem("xray:environment-mode"))).toBe("demo");
	} finally { await app.close(); }
});

test("automated E2E locks UI and server and leaves interactive preference intact", async ({ page, request }) => {
	await page.addInitScript(() => localStorage.setItem("xray:environment-mode", "prod"));
	const outgoing: string[] = [];
	page.on("request", (entry) => { if (entry.url().includes("/api/")) outgoing.push(new URL(entry.url()).pathname); });
	await page.goto(BROWSER);
	await expect(page.getByRole("heading", { name: "Dashboard", exact: true }).last()).toBeVisible();
	const descriptor = await (await request.get(`${BROWSER}/__local/environment`)).json();
	expect(descriptor).toMatchObject({ mode: "e2e", locked: true, automated: true });
	if (descriptor.local) {
		await expect(page.getByRole("radio", { name: "Demo", exact: true })).toBeDisabled();
		await expect(page.getByRole("radio", { name: "Prod", exact: true })).toBeDisabled();
		await expect(page.getByRole("radio", { name: "E2E", exact: true })).toBeChecked();
	} else await expect(page.getByRole("group", { name: "Environment" })).toHaveCount(0);
	expect(await page.evaluate(() => localStorage.getItem("xray:environment-mode"))).toBe("prod");
	expect(outgoing.length).toBeGreaterThan(0);
	expect(outgoing.every((path) => path.startsWith(`/__local/instances/${descriptor.instanceId}/api/`))).toBe(true);
	for (const mode of ["demo", "prod", "https://xray.hexly.ai"]) {
		const response = await request.post(`${BROWSER}/__local/environment/select`, { headers: { Origin: BROWSER, "X-Xray-Local-Csrf": descriptor.csrfToken }, data: { mode, instanceId: descriptor.instanceId } });
		expect(response.status()).toBe(409);
	}
	expect((await request.get(`${BROWSER}/__local/instances/expired/api/me`)).status()).toBe(409);
	expect((await request.get(`${BROWSER}/api/me`)).status()).toBe(404);
});

test("hosted capture uses real E2E backend and hides local controls", async ({ page }) => {
	const app = await startLocalServer({ mode: "e2e", automated: true, hosted: true, port: 0, built: true });
	try {
		await page.addInitScript(() => localStorage.setItem("xray:environment-mode", "prod"));
		await page.goto(app.url);
		await expect(page.getByRole("heading", { name: "Dashboard", exact: true }).last()).toBeVisible();
		await expect(page.getByRole("group", { name: "Environment" })).toHaveCount(0);
		await expect(page.getByRole("radio", { name: "Prod", exact: true })).toHaveCount(0);
		expect(await page.evaluate(() => localStorage.getItem("xray:environment-mode"))).toBe("prod");
	} finally { await app.close(); }
});
