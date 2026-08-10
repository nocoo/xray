/** Stable HSL tag color from name (legacy v1 parity). */
export function generateTagColor(name: string): string {
	const hash = djb2(name.toLowerCase().trim());
	const bucket = Math.abs(hash) % 12;
	const hue = bucket * 30;
	return `hsl(${hue}, 70%, 45%)`;
}

function djb2(str: string): number {
	let hash = 5381;
	for (let i = 0; i < str.length; i++) {
		hash = (hash * 33) ^ str.charCodeAt(i);
	}
	return hash >>> 0;
}
