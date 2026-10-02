import { expect, test } from "vitest";
import { isolatedEnv } from "../../dev/local-runtime";

test("isolated local commands cannot inherit production credentials or start banner update checks", () => {
	const environment = isolatedEnv({
		PATH: "/tools",
		HOME: "/home/test",
		TMPDIR: "/tmp/test",
		LANG: "en_US.UTF-8",
		CLOUDFLARE_API_TOKEN: "must-not-inherit",
		WRANGLER_HIDE_BANNER: "false",
	});
	expect(environment).toEqual({
		PATH: "/tools",
		HOME: "/home/test",
		TMPDIR: "/tmp/test",
		LANG: "en_US.UTF-8",
		CI: "true",
		WRANGLER_SEND_METRICS: "false",
		WRANGLER_HIDE_BANNER: "true",
		CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: "false",
		CLOUDFLARE_INCLUDE_PROCESS_ENV: "false",
	});
});
