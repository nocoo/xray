import { type LocalRuntime, startLocalRuntime } from "../../dev/local-runtime.js";

let runtime: LocalRuntime | undefined;

export async function setup(): Promise<void> {
	runtime = await startLocalRuntime("e2e");
	process.env.XRAY_L2_BASE = runtime.url;
	process.env.XRAY_L2_JWT_A = runtime.jwtA;
	process.env.XRAY_L2_JWT_B = runtime.jwtB;
}

export async function teardown(): Promise<void> {
	try {
		await runtime?.stop();
	} finally {
		runtime = undefined;
		delete process.env.XRAY_L2_BASE;
		delete process.env.XRAY_L2_JWT_A;
		delete process.env.XRAY_L2_JWT_B;
	}
}
