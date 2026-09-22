import { describe, expect, test } from "vitest";
import {
	ARTICLE_LIMITS,
	ARTICLE_PAGE_DEFAULT_LIMIT,
	ARTICLE_PAGE_MAX_LIMIT,
	isValidReportDate,
	parseArticleInput,
	parseArticlePageQuery,
} from "./channels.js";

describe("isValidReportDate", () => {
	test("accepts real calendar dates", () => {
		expect(isValidReportDate("2026-09-22")).toBe(true);
		expect(isValidReportDate("2024-02-29")).toBe(true);
		expect(isValidReportDate("0001-01-01")).toBe(true);
		expect(isValidReportDate("9999-12-31")).toBe(true);
	});

	test("rejects invalid formats and calendar dates", () => {
		expect(isValidReportDate("2026-02-30")).toBe(false);
		expect(isValidReportDate("2023-02-29")).toBe(false);
		expect(isValidReportDate("2026-13-01")).toBe(false);
		expect(isValidReportDate("2026-00-10")).toBe(false);
		expect(isValidReportDate("2026-09-00")).toBe(false);
		expect(isValidReportDate("2026-9-22")).toBe(false);
		expect(isValidReportDate("2026/09/22")).toBe(false);
		expect(isValidReportDate("2026-09-22T00:00:00Z")).toBe(false);
		expect(isValidReportDate(" 2026-09-22")).toBe(false);
		expect(isValidReportDate("")).toBe(false);
	});
});

describe("parseArticleInput", () => {
	const valid = {
		external_id: "ext-1",
		title: "研报 · 日报",
		report_date: "2026-09-22",
		markdown: "## 进展\n\n中文 English",
	};

	test("accepts full and minimal payloads with normalization", () => {
		const full = parseArticleInput({
			...valid,
			summary: "  A brief report  ",
			author: " Research Team ",
		});
		expect(full).toEqual({
			ok: true,
			value: {
				externalId: "ext-1",
				title: "研报 · 日报",
				reportDate: "2026-09-22",
				markdown: "## 进展\n\n中文 English",
				summary: "A brief report",
				author: "Research Team",
			},
		});
		const minimal = parseArticleInput(valid);
		expect(minimal.ok && minimal.value.summary).toBeNull();
		expect(minimal.ok && minimal.value.author).toBeNull();
		const withNulls = parseArticleInput({ ...valid, summary: null, author: null });
		expect(withNulls.ok && withNulls.value.summary).toBeNull();
		const blanks = parseArticleInput({ ...valid, summary: "   ", author: "" });
		expect(blanks.ok && blanks.value.summary).toBeNull();
		expect(blanks.ok && blanks.value.author).toBeNull();
	});

	test("rejects non-object bodies", () => {
		for (const bad of [null, undefined, "text", 42, [], true]) {
			const r = parseArticleInput(bad);
			expect(r.ok).toBe(false);
			if (!r.ok) expect(r.status).toBe(400);
		}
	});

	test("rejects unknown fields strictly", () => {
		const r = parseArticleInput({ ...valid, extra: "x" });
		expect(r).toEqual({ ok: false, status: 400, error: "unknown field: extra" });
	});

	test("rejects missing/wrong-typed required fields", () => {
		expect(parseArticleInput({ ...valid, external_id: 5 })).toEqual({
			ok: false,
			status: 400,
			error: "external_id required",
		});
		expect(parseArticleInput({ ...valid, external_id: "  " })).toEqual({
			ok: false,
			status: 400,
			error: "external_id required",
		});
		expect(parseArticleInput({ ...valid, title: "" })).toEqual({
			ok: false,
			status: 400,
			error: "title required",
		});
		expect(parseArticleInput({ ...valid, markdown: 1 })).toEqual({
			ok: false,
			status: 400,
			error: "markdown required",
		});
		expect(parseArticleInput({ ...valid, markdown: "   " })).toEqual({
			ok: false,
			status: 400,
			error: "markdown required",
		});
	});

	test("rejects invalid report dates", () => {
		for (const bad of ["2026-02-30", "2026-9-22", "not-a-date", 42, null]) {
			const r = parseArticleInput({ ...valid, report_date: bad });
			expect(r.ok).toBe(false);
			if (!r.ok) {
				expect(r.status).toBe(400);
				expect(r.error).toContain("report_date");
			}
		}
	});

	test("enforces field length limits", () => {
		expect(
			parseArticleInput({ ...valid, external_id: "e".repeat(ARTICLE_LIMITS.externalId + 1) }),
		).toEqual({ ok: false, status: 400, error: "external_id too long" });
		expect(parseArticleInput({ ...valid, title: "t".repeat(ARTICLE_LIMITS.title + 1) })).toEqual({
			ok: false,
			status: 400,
			error: "title too long",
		});
		expect(
			parseArticleInput({ ...valid, summary: "s".repeat(ARTICLE_LIMITS.summary + 1) }),
		).toEqual({ ok: false, status: 400, error: "summary too long" });
		expect(parseArticleInput({ ...valid, author: "a".repeat(ARTICLE_LIMITS.author + 1) })).toEqual({
			ok: false,
			status: 400,
			error: "author too long",
		});
		expect(parseArticleInput({ ...valid, summary: 9 })).toEqual({
			ok: false,
			status: 400,
			error: "summary must be string",
		});
		expect(parseArticleInput({ ...valid, author: false })).toEqual({
			ok: false,
			status: 400,
			error: "author must be string",
		});
	});

	test("markdown is stored verbatim and capped in UTF-8 bytes", () => {
		const padded = { ...valid, markdown: "  keep  \n spacing  " };
		const r = parseArticleInput(padded);
		expect(r.ok && r.value.markdown).toBe("  keep  \n spacing  ");
		const huge = parseArticleInput({
			...valid,
			markdown: "汉".repeat(Math.floor(ARTICLE_LIMITS.markdownBytes / 3) + 1),
		});
		expect(huge).toEqual({ ok: false, status: 413, error: "markdown too large" });
		const atLimit = parseArticleInput({
			...valid,
			markdown: "a".repeat(ARTICLE_LIMITS.markdownBytes),
		});
		expect(atLimit.ok).toBe(true);
	});
});

describe("parseArticlePageQuery", () => {
	test("defaults", () => {
		expect(parseArticlePageQuery({})).toEqual({
			ok: true,
			value: {
				dateFrom: "",
				dateTo: "",
				query: "",
				tagIds: [],
				before: null,
				limit: ARTICLE_PAGE_DEFAULT_LIMIT,
			},
		});
		expect(
			parseArticlePageQuery({
				date_from: "",
				date_to: "",
				q: "",
				tag_ids: "",
				before: "",
				limit: "",
			}),
		).toEqual({
			ok: true,
			value: {
				dateFrom: "",
				dateTo: "",
				query: "",
				tagIds: [],
				before: null,
				limit: ARTICLE_PAGE_DEFAULT_LIMIT,
			},
		});
	});

	test("valid values", () => {
		expect(parseArticlePageQuery({ date_from: "2026-09-22", before: "77", limit: "100" })).toEqual({
			ok: true,
			value: { dateFrom: "2026-09-22", dateTo: "", query: "", tagIds: [], before: 77, limit: 100 },
		});
		expect(parseArticlePageQuery({ limit: "1" })).toEqual({
			ok: true,
			value: { dateFrom: "", dateTo: "", query: "", tagIds: [], before: null, limit: 1 },
		});
	});

	test("invalid values", () => {
		expect(parseArticlePageQuery({ date_from: "2026-02-30" })).toEqual({
			ok: false,
			error: "invalid date_from",
		});
		expect(parseArticlePageQuery({ date_from: "abc" })).toEqual({
			ok: false,
			error: "invalid date_from",
		});
		expect(parseArticlePageQuery({ before: "0" }).ok).toBe(false);
		expect(parseArticlePageQuery({ before: "-3" }).ok).toBe(false);
		expect(parseArticlePageQuery({ before: "2.5" }).ok).toBe(false);
		expect(parseArticlePageQuery({ before: "x" }).ok).toBe(false);
		expect(parseArticlePageQuery({ limit: "0" }).ok).toBe(false);
		expect(parseArticlePageQuery({ limit: String(ARTICLE_PAGE_MAX_LIMIT + 1) }).ok).toBe(false);
		expect(parseArticlePageQuery({ limit: "1.5" }).ok).toBe(false);
		expect(parseArticlePageQuery({ limit: "abc" }).ok).toBe(false);
	});
});

test("article filters normalize bounded phrases and distinct IDs", () => {
	expect(
		parseArticlePageQuery({
			date_to: "2024-02-29",
			q: "  literal %_\\ 中文  ",
			tag_ids: "3,1,3,2",
		}),
	).toMatchObject({
		ok: true,
		value: { dateFrom: "", dateTo: "2024-02-29", query: "literal %_\\ 中文", tagIds: [1, 2, 3] },
	});
	expect(
		parseArticlePageQuery({
			q: "x".repeat(200),
			tag_ids: Array.from({ length: 20 }, (_, i) => i + 1).join(","),
		}).ok,
	).toBe(true);
	for (const raw of [
		{ date_to: "2025-02-29" },
		{ date_from: "2026-09-23", date_to: "2026-09-22" },
		{ q: "x".repeat(201) },
		{ tag_ids: "1," },
		{ tag_ids: "0" },
		{ tag_ids: "-1" },
		{ tag_ids: "1.5" },
		{ tag_ids: "1e2" },
		{ tag_ids: " 1" },
		{ tag_ids: "01" },
		{ tag_ids: "9007199254740992" },
		{ tag_ids: Array.from({ length: 21 }, (_, i) => i + 1).join(",") },
		{ tag_ids: "1,".repeat(2049) },
	])
		expect(parseArticlePageQuery(raw).ok, JSON.stringify(raw)).toBe(false);
});
