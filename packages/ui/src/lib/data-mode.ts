export type DataMode = "mock" | "product";

const STORAGE_KEY = "xray:data-mode";

export function getDataMode(): DataMode {
	if (!import.meta.env.DEV) return "product";
	return sessionStorage.getItem(STORAGE_KEY) === "product" ? "product" : "mock";
}

export function selectDataMode(mode: string): void {
	if (mode !== "mock" && mode !== "product") return;
	sessionStorage.setItem(STORAGE_KEY, mode);
	window.location.assign("/");
}

export function apiPath(path: string): string {
	return import.meta.env.DEV && getDataMode() === "product" ? `/__product${path}` : path;
}
