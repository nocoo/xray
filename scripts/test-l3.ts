import { spawn } from "node:child_process";
import { once } from "node:events";
import { startLocalServer } from "../packages/ui/dev/local-server";
import { assertTestCredentials, isolatedEnv, ROOT } from "../packages/worker/dev/local-runtime";

assertTestCredentials();
const app = await startLocalServer({
	mode: "e2e",
	automated: true,
	hosted: !!process.env.CI,
	port: 0,
	built: true,
});
const runtime = app.runtime;
if (!runtime) throw new Error("E2E runtime unavailable");
let child: ReturnType<typeof spawn> | undefined;
let closing: Promise<void> | undefined;
const close = () =>
	(closing ??= (async () => {
		if (child && child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
		await app.close();
	})());
for (const signal of ["SIGINT", "SIGTERM"] as const)
	process.once(signal, () => {
		void close().then(() => process.exit(1));
	});
try {
	child = spawn("bun", ["x", "--no-install", "playwright", "test", ...process.argv.slice(2)], {
		cwd: ROOT,
		stdio: "inherit",
		env: {
			...isolatedEnv(),
			CI: process.env.CI,
			PLAYWRIGHT_BROWSER_URL: app.url,
			PLAYWRIGHT_WORKER_URL: runtime.url,
			PLAYWRIGHT_INGEST_URL: runtime.url,
			XRAY_TEST_JWT_A: runtime.jwtA,
			XRAY_TEST_JWT_B: runtime.jwtB,
			XRAY_E2E_MANAGED: "1",
		},
	});
	const [code] = await once(child, "exit");
	process.exitCode = code === 0 ? 0 : 1;
} finally {
	await close();
}
