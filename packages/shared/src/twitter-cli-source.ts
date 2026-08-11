import { type SpawnFn, twitterStatus, twitterUserPosts } from "./producer-spawn.js";
import { mapTwitterCliEnvelope } from "./twitter-cli-map.js";
import type { TimelineFetchResult, XTimelineSource } from "./x-timeline-source.js";

export const TWITTER_CLI_SOURCE_ID = "twitter-cli" as const;

export type TwitterCliSourceDeps = {
	spawn: SpawnFn;
	bin: string;
	env: Record<string, string | undefined>;
	/** Passed to `twitter user-posts --max` (vendor may page until this). */
	max: number;
};

function toResult(raw: unknown): TimelineFetchResult {
	const mapped = mapTwitterCliEnvelope(raw);
	if (mapped.envelopeError) {
		throw new Error(mapped.envelopeError);
	}
	return {
		items: mapped.items,
		skipped: mapped.skipped,
		raw,
	};
}

/**
 * twitter-cli adapter — sole module that knows vendor CLI + JSON shape.
 * Orchestrators should depend on `XTimelineSource` only.
 */
export function createTwitterCliSource(deps: TwitterCliSourceDeps): XTimelineSource {
	const cliDeps = {
		spawn: deps.spawn,
		bin: deps.bin,
		env: deps.env,
		max: deps.max,
	};

	return {
		id: TWITTER_CLI_SOURCE_ID,

		async ready(): Promise<void> {
			await twitterStatus(cliDeps);
		},

		async fetchHandle(handle: string): Promise<TimelineFetchResult> {
			const { data } = await twitterUserPosts(cliDeps, handle);
			return toResult(data);
		},

		parseCachedRaw(raw: unknown): TimelineFetchResult {
			return toResult(raw);
		},
	};
}
