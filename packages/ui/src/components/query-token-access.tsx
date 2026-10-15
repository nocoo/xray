import { Field } from "@nocoo/basalt";
import { MultiSelect } from "@nocoo/basalt/components/multi-select";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@nocoo/basalt/components/select";
import type { QueryTokenAccess } from "@xray/shared";
import { Eye, Radio } from "lucide-react";

export function QueryTokenAccessFields({
	access,
	onChange,
	watchlists,
	channels,
	disabled,
}: {
	access: QueryTokenAccess;
	onChange: (access: QueryTokenAccess) => void;
	watchlists: { id: number; name: string }[];
	channels: { id: number; name: string }[];
	disabled: boolean;
}) {
	return (
		<div className="space-y-basalt-layout">
			<Field label="Read access" htmlFor="query-access-mode">
				<Select
					value={access.mode}
					onValueChange={(mode) =>
						onChange({ mode: mode as QueryTokenAccess["mode"], watchlistIds: [], channelIds: [] })
					}
					disabled={disabled}
				>
					<SelectTrigger id="query-access-mode">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all">All watchlists and channels</SelectItem>
						<SelectItem value="selected">Selected sources only</SelectItem>
					</SelectContent>
				</Select>
			</Field>
			{access.mode === "selected" ? (
				<>
					{(
						[
							{ key: "watchlistIds", label: "Watchlists", catalog: watchlists, Icon: Eye },
							{ key: "channelIds", label: "Channels", catalog: channels, Icon: Radio },
						] as const
					).map(({ key, label, catalog, Icon }) => (
						<Field key={key} label={label}>
							<MultiSelect
								label={label}
								disabled={disabled}
								options={[
									...catalog.map((source) => ({
										value: String(source.id),
										label: source.name,
										leading: (
											<Icon className="size-basalt-icon" aria-hidden="true" strokeWidth={1.5} />
										),
									})),
									...access[key]
										.filter((id) => !catalog.some((source) => source.id === id))
										.map((id) => ({ value: String(id), label: `Deleted source #${id}` })),
								]}
								value={access[key].map(String)}
								onValueChange={(ids) => onChange({ ...access, [key]: ids.map(Number) })}
								placeholder={`Choose ${label.toLowerCase()}`}
							/>
						</Field>
					))}
					<p className="text-basalt-sm text-basalt-muted-foreground">
						Select 1-100 sources in any combination. New sources are not added automatically. Remove
						deleted sources before saving.
					</p>
				</>
			) : (
				<p className="text-basalt-sm text-basalt-muted-foreground">
					Reads every post and article in your account, including future watchlists and channels.
				</p>
			)}
		</div>
	);
}
