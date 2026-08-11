export type {
	CanonicalAuthor,
	CanonicalCustomItem,
	CanonicalItem,
	CanonicalXItem,
	XMedia,
	XTweet,
	XUser,
} from "./canonical-item.js";
export {
	canonicalText,
	canonicalTitle,
	parseCanonicalItem,
	resolveAuthorId,
	resolveAuthorUsername,
} from "./canonical-item.js";
export { normalizeHandle } from "./handle.js";
export type { NavGroupDef, NavItemDef } from "./nav.js";
export { V2_NAV_GROUPS, V2_NAV_LABELS } from "./nav.js";

// --- Producer core (source-agnostic) ---
export type { IngestPushBody } from "./producer-core.js";
export {
	buildIngestBatches,
	filterItemsByWindow,
	INGEST_MAX_ITEMS,
} from "./producer-core.js";
export type { FetchFn, PushBatchDeps, PushBatchResult } from "./producer-push.js";
export { pushIngestBatch } from "./producer-push.js";
/** @deprecated use createTwitterCliSource */
export type {
	SpawnFn,
	SpawnResult,
	TwitterCliDeps,
	TwitterCliIssue,
	TwitterCliIssueKind,
} from "./producer-spawn.js";
/** @deprecated */
export {
	atomicWriteJson,
	formatTwitterCliIssue,
	TwitterCliError,
	twitterStatus,
	twitterUserPosts,
} from "./producer-spawn.js";
export type { MembersGraph } from "./producer-utils.js";
/** @deprecated twitter-cli private env scrub */
export {
	assertAllowedBaseUrl,
	cacheFileBase,
	exitCodeForRefresh,
	isValidXHandle,
	parseMembersGraph,
	parsePushSuccessBody,
	pushRetryDelayMs,
	scrubEnvForTwitter,
	shouldStopPush,
	TWITTER_CHILD_ENV_ALLOW,
	X_HANDLE_RE,
	XRAY_SECRET_ENV_KEYS,
} from "./producer-utils.js";
export type { SourceType } from "./source.js";
export { isSourceType, SOURCE_TYPE_LABELS, SOURCE_TYPES } from "./source.js";
/** @deprecated internal */
export type {
	EnvelopeMapResult,
	MapFail,
	MapOk,
	MapResult,
	TwitterCliEnvelope,
	TwitterCliTweet,
} from "./twitter-cli-map.js";
/** @deprecated internal — tests / adapter only */
export {
	mapTwitterCliEnvelope,
	mapTwitterCliTweetToCanonical,
	toRfc3339Z,
} from "./twitter-cli-map.js";
// --- twitter-cli adapter (replaceable; do not leak into other packages) ---
export type { TwitterCliSourceDeps } from "./twitter-cli-source.js";
export {
	createTwitterCliSource,
	TWITTER_CLI_SOURCE_ID,
} from "./twitter-cli-source.js";
export { XRAY_VERSION } from "./version.js";
export type {
	TimelineFetchResult,
	TimelineSkip,
	XTimelineSource,
} from "./x-timeline-source.js";
