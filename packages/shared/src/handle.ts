/** Handle normalization R3-10 / R4-05: trim, strip @, lowercase. */
export function normalizeHandle(raw: string): string {
	return raw.trim().replace(/^@+/, "").toLowerCase();
}
