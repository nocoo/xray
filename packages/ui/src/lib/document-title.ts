export const SITE_TITLE = "X-Ray";

export function documentTitle(page?: string | null): string {
	const name = page?.trim();
	if (!name || name === SITE_TITLE) return SITE_TITLE;
	return `${name} - ${SITE_TITLE}`;
}
