import { apiGet, apiPatch } from "./client";

export type SettingsDto = {
	email: string;
	name: string | null;
	image: string | null;
	ingest: { windowHours: number };
};

export function fetchSettings() {
	return apiGet<SettingsDto>("/api/settings");
}

export function patchSettings(windowHours: number) {
	return apiPatch<SettingsDto>("/api/settings", { ingest: { windowHours } });
}
