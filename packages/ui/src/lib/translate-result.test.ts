import { describe, expect, test } from "vitest";
import { readTranslateRow } from "./translate-result";

describe("readTranslateRow", () => {
	test("treats in-flight work as pending", () => {
		expect(readTranslateRow({ id: 1, ai_status: "pending" })).toEqual({ status: "pending" });
	});

	test("reads succeeded text", () => {
		expect(
			readTranslateRow({
				id: 1,
				ai_status: "succeeded",
				translatedText: "你好",
				summaryText: "摘",
			}),
		).toEqual({
			status: "succeeded",
			translatedText: "你好",
			quotedTranslatedText: null,
			summaryText: "摘",
		});
	});

	test("empty result is a config error", () => {
		expect(readTranslateRow(undefined)).toEqual({
			status: "failed",
			error: "Translation failed — configure AI Settings",
		});
	});
});
