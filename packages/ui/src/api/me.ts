import { apiGet } from "./client";

export type MeUser = {
	id: string;
	email: string;
	name: string | null;
	image: string | null;
};

export type MeResponse = {
	authenticated: boolean;
	user: MeUser | null;
};

export function fetchMe(): Promise<MeResponse> {
	return apiGet<MeResponse>("/api/me");
}
