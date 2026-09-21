/**
 * D1-shaped adapter over node:sqlite for L1 coverage of real SQL paths.
 * Unit tests only — not production.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS = join(__dirname, "../../migrations");

type StmtApi = {
	bind: (...args: unknown[]) => StmtApi;
	first: <T>() => Promise<T | null>;
	all: <T>() => Promise<{ results: T[] }>;
	execute: () => {
		results: unknown[];
		success: boolean;
		meta: { changes: number; last_row_id: number };
	};
	run: () => Promise<{ success: boolean; meta: { changes: number; last_row_id: number } }>;
};

export function createSqliteD1(opts?: { migrate?: boolean }): D1Database {
	const raw = new DatabaseSync(":memory:");
	raw.exec("PRAGMA foreign_keys = ON;");
	if (opts?.migrate !== false) {
		const files = readdirSync(MIGRATIONS)
			.filter((f) => /^\d{4}_.+\.sql$/.test(f))
			.sort();
		for (const f of files) {
			raw.exec(readFileSync(join(MIGRATIONS, f), "utf-8"));
		}
	}

	function prepare(sql: string): StmtApi {
		const stmt = raw.prepare(sql);
		let binds: unknown[] = [];
		const api: StmtApi = {
			bind(...args: unknown[]) {
				binds = args;
				return api;
			},
			async first<T>() {
				const row = stmt.get(...(binds as never[])) as T | undefined;
				return (row ?? null) as T | null;
			},
			async all<T>() {
				const results = stmt.all(...(binds as never[])) as T[];
				return { results };
			},
			execute() {
				const results = stmt.all(...(binds as never[]));
				const info = raw
					.prepare("SELECT changes() AS changes, last_insert_rowid() AS last_row_id")
					.get() as { changes: number; last_row_id: number };
				return { results, success: true, meta: info };
			},
			async run() {
				const info = stmt.run(...(binds as never[]));
				return {
					success: true,
					meta: {
						changes: Number(info.changes ?? 0),
						last_row_id: Number(info.lastInsertRowid ?? 0),
					},
				};
			},
		};
		return api;
	}

	const db = {
		prepare,
		async batch(statements: StmtApi[]) {
			raw.exec("BEGIN");
			try {
				const out = statements.map((s) => s.execute());
				raw.exec("COMMIT");
				return out;
			} catch (error) {
				raw.exec("ROLLBACK");
				throw error;
			}
		},
		async exec(sql: string) {
			raw.exec(sql);
			return { count: 0, duration: 0 };
		},
	};
	return db as unknown as D1Database;
}
