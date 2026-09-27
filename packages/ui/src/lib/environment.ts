import { allowDraftNavigation, hasUnsavedDrafts } from "./unsaved-drafts";

export type EnvironmentMode = "demo" | "e2e" | "prod";
export type LocalEnvironment = Readonly<{
	local: boolean;
	mode: EnvironmentMode | null;
	locked: boolean;
	automated: boolean;
	instanceId: string | null;
	csrfToken: string;
	ingestBase: string | null;
}>;

const STORAGE_KEY = "xray:environment-mode";
let environment: LocalEnvironment | null = null;
let initialization: Promise<void> | undefined;
let switching = false;

function isMode(value: unknown): value is EnvironmentMode {
	return value === "demo" || value === "e2e" || value === "prod";
}

function descriptor(value: LocalEnvironment): LocalEnvironment {
	if (
		!value ||
		typeof value.local !== "boolean" ||
		typeof value.locked !== "boolean" ||
		typeof value.automated !== "boolean" ||
		!value.csrfToken ||
		(value.mode !== null && !isMode(value.mode)) ||
		(value.locked && value.mode !== "e2e") ||
		(value.mode !== null &&
			(!value.instanceId || !/^[a-zA-Z0-9_-]+$/.test(value.instanceId) || !value.ingestBase))
	) {
		throw new Error("Invalid local environment descriptor");
	}
	return Object.freeze(value);
}

async function fetchDescriptor(path: string, init?: RequestInit) {
	const response = await fetch(path, { credentials: "same-origin", ...init });
	if (!response.ok) throw new Error(`Local environment unavailable (${response.status})`);
	return descriptor(await response.json());
}

async function accept(current: LocalEnvironment, mode: EnvironmentMode) {
	const accepted = await fetchDescriptor("/__local/environment/select", {
		method: "POST",
		headers: { "Content-Type": "application/json", "X-Xray-Local-Csrf": current.csrfToken },
		body: JSON.stringify({ mode, instanceId: current.instanceId }),
	});
	if (accepted.mode !== mode) throw new Error("Local environment selection was not accepted");
	return accepted;
}

function remember(accepted: LocalEnvironment) {
	if (!accepted.local || accepted.automated) return;
	try {
		localStorage.setItem(STORAGE_KEY, accepted.mode as EnvironmentMode);
	} catch {
		// Storage denial must not undo an accepted instance selection.
	}
}

async function initialize() {
	if (window.__XRAY_LOCAL__ !== true) return;
	let current = await fetchDescriptor("/__local/environment");
	if (current.mode === null) {
		let mode: EnvironmentMode = current.automated ? "e2e" : "demo";
		if (current.local && !current.automated) {
			try {
				const stored = localStorage.getItem(STORAGE_KEY);
				if (isMode(stored)) mode = stored;
			} catch {
				// Use Demo when preferences are unavailable.
			}
		}
		current = await accept(current, mode);
		remember(current);
	}
	environment = current;
}

export function initializeEnvironment(): Promise<void> {
	initialization ??= initialize();
	return initialization;
}

export function getEnvironment() {
	return environment;
}

export function apiPath(path: string): string {
	if (environment) return `/__local/instances/${environment.instanceId}${path}`;
	if (window.__XRAY_LOCAL__ === true) throw new Error("Local environment is not initialized");
	return path;
}

export function environmentScope(): string {
	return environment ? `instance:${environment.instanceId}` : "hosted";
}

export function ingestBase(): string {
	if (environment?.ingestBase) return environment.ingestBase.replace(/\/$/, "");
	if (window.__XRAY_LOCAL__ === true) throw new Error("Local environment is not initialized");
	return "https://xray-ingest.worker.hexly.ai";
}

export async function selectEnvironment(
	mode: string,
	confirmDiscard: () => Promise<boolean>,
): Promise<boolean> {
	const current = environment;
	if (
		!current?.local ||
		current.automated ||
		current.locked ||
		switching ||
		!isMode(mode) ||
		mode === current.mode
	)
		return false;
	switching = true;
	try {
		if (hasUnsavedDrafts() && !(await confirmDiscard())) return false;
		const accepted = await accept(current, mode);
		remember(accepted);
		allowDraftNavigation();
		window.location.assign("/");
		return true;
	} finally {
		switching = false;
	}
}
