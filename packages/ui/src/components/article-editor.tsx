import { Button, Field, Input } from "@nocoo/basalt";
import { InputArea } from "@nocoo/basalt/components/input-area";
import { ARTICLE_LIMITS, type ArticleInput, type ChannelArticle } from "@xray/shared";
import { Save, X } from "lucide-react";
import { useState } from "react";

export function ArticleEditor({
	article,
	busy,
	onSave,
	onCancel,
}: {
	article: ChannelArticle;
	busy: boolean;
	onSave: (input: Omit<ArticleInput, "external_id">) => void;
	onCancel: () => void;
}) {
	const [draft, setDraft] = useState({
		title: article.title,
		report_date: article.reportDate,
		author: article.author ?? "",
		summary: article.summary ?? "",
		markdown: article.markdown,
	});
	return (
		<form
			className="mx-auto max-w-6xl p-4 font-sans"
			aria-label="Edit article"
			onSubmit={(event) => {
				event.preventDefault();
				onSave(draft);
			}}
		>
			<fieldset disabled={busy} className="min-w-0 space-y-4">
				<div className="flex flex-wrap items-center justify-between gap-3">
					<h2 className="text-lg font-semibold">Edit article</h2>
					<div className="flex items-center gap-2">
						<Button size="sm" variant="outline" onClick={onCancel}>
							<X className="h-4 w-4" /> Cancel
						</Button>
						<Button size="sm" type="submit">
							<Save className="h-4 w-4" /> Save article
						</Button>
					</div>
				</div>
				<Field label="Article title" required>
					<Input
						autoFocus
						required
						maxLength={ARTICLE_LIMITS.title}
						value={draft.title}
						onChange={(e) => setDraft({ ...draft, title: e.target.value })}
					/>
				</Field>
				<div className="grid items-start gap-4 sm:grid-cols-2">
					<Field label="Report date" required>
						<Input
							type="date"
							required
							value={draft.report_date}
							onChange={(e) => setDraft({ ...draft, report_date: e.target.value })}
						/>
					</Field>
					<Field label="Author" required={false}>
						<Input
							maxLength={ARTICLE_LIMITS.author}
							value={draft.author}
							onChange={(e) => setDraft({ ...draft, author: e.target.value })}
						/>
					</Field>
				</div>
				<Field label="Summary" required={false}>
					<InputArea
						rows={2}
						maxLength={ARTICLE_LIMITS.summary}
						value={draft.summary}
						onChange={(e) => setDraft({ ...draft, summary: e.target.value })}
					/>
				</Field>
				<Field
					label="Markdown"
					required
					hint="Use Markdown for formatting and HTTPS links for images."
				>
					<InputArea
						required
						rows={18}
						className="font-mono text-sm"
						value={draft.markdown}
						onChange={(e) => setDraft({ ...draft, markdown: e.target.value })}
					/>
				</Field>
			</fieldset>
		</form>
	);
}
