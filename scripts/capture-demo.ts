import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "@playwright/test";
import { installExternalMedia } from "../fixtures/e2e";
import { FIXTURE_ANCHOR_ISO, FIXTURE_VERSION } from "../fixtures/primitives";
import { startLocalServer } from "../packages/ui/dev/local-server";
import { ROOT } from "../packages/worker/dev/local-runtime";

const app = await startLocalServer({
	mode: "e2e",
	automated: true,
	hosted: !!process.env.CI,
	catalog: "demo",
	port: 0,
	built: true,
});
try {
	const browser = await chromium.launch();
	try {
		const viewport = { width: 1440, height: 1000 };
		const page = await browser.newPage({ viewport, locale: "en-US", timezoneId: "UTC" });
		await installExternalMedia(page);
		const output = join(ROOT, "reports", "captures", new Date().toISOString().replaceAll(":", "-"));
		await mkdir(output, { recursive: true });
		const routes = {
			dashboard: "/",
			timeline: "/watchlist/1",
			reader: "/channels/10/articles/970101",
			channels: "/channels",
			tags: "/tags",
			settings: "/settings",
		};
		for (const [name, route] of Object.entries(routes)) {
			await page.goto(`${app.url}${route}`);
			await page.waitForLoadState("networkidle");
			await page.locator("[data-basalt-surface-root]").waitFor();
			await page.waitForFunction(() =>
				[...document.images].every((image) => image.complete && image.naturalWidth > 0),
			);
			await page
				.locator("[data-basalt-surface-root]")
				.screenshot({ path: join(output, `${name}.png`) });
		}
		await writeFile(
			join(output, "manifest.json"),
			JSON.stringify(
				{
					revision: execFileSync("git", ["rev-parse", "HEAD"], {
						cwd: ROOT,
						encoding: "utf8",
					}).trim(),
					dirty: !!execFileSync("git", ["status", "--porcelain"], {
						cwd: ROOT,
						encoding: "utf8",
					}).trim(),
					fixtureVersion: FIXTURE_VERSION,
					anchor: FIXTURE_ANCHOR_ISO,
					viewport,
					locale: "en-US",
					timezone: "UTC",
					routes,
					media: "Exact approved external URLs served from owned fixture assets",
					mode: "disposable-e2e-demo-catalog",
				},
				null,
				2,
			),
		);
		console.log(`演示截图已保存：${output}`);
	} finally {
		await browser.close();
	}
} finally {
	await app.close();
}
