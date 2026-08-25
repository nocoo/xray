export const POST_TEXT_CLAMP_LINES = 6;
export const QUOTED_TEXT_CLAMP_LINES = 4;

export function parseLineHeightPx(lineHeight: string, fontSizePx: number): number {
	const fallback = fontSizePx > 0 ? fontSizePx * 1.625 : 0;
	if (lineHeight.endsWith("px")) {
		const n = Number.parseFloat(lineHeight);
		return Number.isFinite(n) && n > 0 ? n : fallback;
	}
	const n = Number.parseFloat(lineHeight);
	if (Number.isFinite(n) && n > 0) return n * (fontSizePx > 0 ? fontSizePx : 0);
	return fallback;
}

export function resolveClampMaxHeight(lineHeightPx: number, lines: number): number {
	if (!Number.isFinite(lineHeightPx) || lineHeightPx <= 0) return 0;
	if (!Number.isFinite(lines) || lines <= 0) return 0;
	return lineHeightPx * lines;
}

export function textBlockOverflows(scrollHeight: number, maxHeight: number): boolean {
	if (!Number.isFinite(scrollHeight) || !Number.isFinite(maxHeight) || maxHeight <= 0) {
		return false;
	}
	return scrollHeight > maxHeight + 1;
}
