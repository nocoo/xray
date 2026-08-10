/** Tiny D1 stand-in for L1/L2 skeleton tests (not a full SQL engine). */
export type MockRow = Record<string, unknown>;

export function createMockD1(seed: MockRow[] = []) {
	const rows = [...seed];
	return {
		_rows: rows,
		prepare(sql: string) {
			const binds: unknown[] = [];
			const stmt = {
				bind(...args: unknown[]) {
					binds.push(...args);
					return stmt;
				},
				async first<T extends MockRow>() {
					if (sql.includes("SELECT 1")) return { ok: 1 } as unknown as T;
					return (rows[0] as T) ?? null;
				},
				async all<T extends MockRow>() {
					return { results: rows as T[] };
				},
				async run() {
					return { meta: { changes: 1 } };
				},
			};
			return stmt;
		},
		async batch() {
			return [];
		},
		async exec() {
			return { count: 0, duration: 0 };
		},
	} as unknown as D1Database & { _rows: MockRow[] };
}
