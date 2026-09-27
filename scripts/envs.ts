import { parseArgs } from "node:util";
import { startLocalServer } from "../packages/ui/dev/local-server";
import {
	createOwned,
	isMode,
	removeOwned,
	startLocalRuntime,
} from "../packages/worker/dev/local-runtime";

const { values, positionals } = parseArgs({
	args: process.argv.slice(2).filter((arg) => arg !== "--"),
	allowPositionals: true,
	options: { mode: { type: "string" }, built: { type: "boolean" }, port: { type: "string" } },
});
const command = positionals[0] ?? "dev";
const mode = values.mode;
if (mode !== undefined && !isMode(mode)) throw new Error("Expected demo, e2e or prod");

if (["init", "seed", "migrate", "reset"].includes(command)) {
	if (mode !== "demo") throw new Error("Database commands require --mode demo");
	const state = await createOwned("demo");
	if (command === "reset") await removeOwned(state);
	if (command === "seed" && state.owner.fixtureVersion)
		throw new Error("Demo is already seeded. Use explicit reset to replace its data.");
	const runtime = await startLocalRuntime("demo");
	await runtime.stop();
	console.log(`Demo ${command} 已完成。`);
} else if (command === "dev") {
	const app = await startLocalServer({
		mode,
		built: !!values.built,
		port: values.port ? Number(values.port) : 7007,
	});
	console.log("Xray 本地环境：https://xray.dev.hexly.ai");
	let stopping = false;
	const stop = async () => {
		if (stopping) return;
		stopping = true;
		try {
			await app.close();
			process.exit(0);
		} catch (error) {
			console.error(error);
			process.exit(1);
		}
	};
	process.once("SIGINT", stop);
	process.once("SIGTERM", stop);
} else throw new Error(`Unknown environment command: ${command}`);
