export type TranslateApiRow = {
	id?: number;
	ai_status: string;
	error?: string;
	translatedText?: string | null;
	quotedTranslatedText?: string | null;
	summaryText?: string | null;
};

export type TranslateRowView =
	| { status: "pending" }
	| {
			status: "succeeded";
			translatedText: string;
			quotedTranslatedText: string | null;
			summaryText: string | null;
	  }
	| { status: "failed"; error: string };

export function readTranslateRow(row: TranslateApiRow | undefined): TranslateRowView {
	if (row?.ai_status === "pending") return { status: "pending" };
	if (row?.ai_status === "succeeded" && row.translatedText) {
		return {
			status: "succeeded",
			translatedText: row.translatedText,
			quotedTranslatedText: row.quotedTranslatedText ?? null,
			summaryText: row.summaryText ?? null,
		};
	}
	return {
		status: "failed",
		error: row?.error || "Translation failed — configure AI Settings",
	};
}
