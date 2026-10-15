import { Badge, Button } from "@nocoo/basalt";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@nocoo/basalt/components/collapsible";
import { DataTable, type DataTableColumn } from "@nocoo/basalt/components/data-table";
import type { ManagedToken, Tag, TokenKind } from "@xray/shared";
import {
	Activity,
	ArrowUpRight,
	ChevronDown,
	Clock3,
	Eye,
	KeyRound,
	Pencil,
	Radio,
	ScanSearch,
	ShieldCheck,
	Tags,
	Trash2,
} from "lucide-react";
import type { MouseEvent } from "react";
import { Link } from "react-router";
import type { TagsVm } from "@/viewmodels/tags-vm";
import { TagAssignment } from "./tag-assignment";

function TokenAccess({
	token,
	compact = false,
	sources,
}: {
	token: ManagedToken;
	compact?: boolean;
	sources: Map<string, string>;
}) {
	const access = token.queryAccess;
	const sourceLabel =
		access?.mode === "selected"
			? [
					...access.watchlistIds.map(
						(id) => sources.get(`watchlist:${id}`) ?? `Deleted watchlist #${id}`,
					),
					...access.channelIds.map(
						(id) => sources.get(`channel:${id}`) ?? `Deleted channel #${id}`,
					),
				].join(" · ")
			: "All watchlists and channels";
	return (
		<div className="min-w-0 space-y-basalt-space-sm">
			{token.kind === "query" ? (
				<div>
					<p className="line-clamp-2 break-words text-basalt-foreground" title={sourceLabel}>
						{sourceLabel}
					</p>
					{access?.mode === "selected" && (
						<p className="text-basalt-sm text-basalt-muted-foreground">
							{access.watchlistIds.length} watchlists · {access.channelIds.length} channels
						</p>
					)}
				</div>
			) : token.channelId === null ? (
				<span className="text-basalt-foreground">All your watchlists</span>
			) : (
				<Link
					to={`/channels/${token.channelId}/settings`}
					className="flex min-w-0 items-center gap-basalt-space-sm hover:underline"
					title={token.channelName ?? undefined}
				>
					<span className="truncate">{token.channelName}</span>
					<ArrowUpRight
						className="size-basalt-icon shrink-0 text-basalt-tag-rose-foreground"
						aria-hidden="true"
						strokeWidth={1.5}
					/>
				</Link>
			)}
			{!compact && (
				<p className="break-words font-mono text-basalt-sm text-basalt-muted-foreground">
					{token.scopes.join(" · ")}
				</p>
			)}
		</div>
	);
}

function TokenActivity({ token }: { token: ManagedToken }) {
	return (
		<div className="space-y-basalt-space-sm text-basalt-sm tabular-nums">
			<div className="flex items-center gap-basalt-space-sm">
				{token.lastUsedAtMs !== null ? (
					<>
						<Activity
							className="size-basalt-icon shrink-0 text-basalt-tag-teal-foreground"
							aria-hidden="true"
							strokeWidth={1.5}
						/>
						<time
							dateTime={new Date(token.lastUsedAtMs).toISOString()}
							title={new Date(token.lastUsedAtMs).toLocaleString()}
						>
							{new Date(token.lastUsedAtMs).toLocaleDateString(undefined, {
								year: "numeric",
								month: "short",
								day: "numeric",
							})}
						</time>
					</>
				) : (
					<span className="inline-flex items-center gap-basalt-space-sm text-basalt-tag-amber-foreground">
						<Clock3 className="size-basalt-icon" aria-hidden="true" strokeWidth={1.5} /> Never used
					</span>
				)}
			</div>
			<p className="text-basalt-muted-foreground">
				Created{" "}
				{new Date(token.createdAtMs).toLocaleDateString(undefined, {
					month: "short",
					day: "numeric",
					year: "numeric",
				})}
			</p>
		</div>
	);
}

export function TokensTable({
	tokens,
	kind,
	sources,
	loading,
	busy,
	tagsVm,
	onTags,
	onRename,
	onRevoke,
}: {
	tokens: ManagedToken[];
	kind: TokenKind;
	sources: Map<string, string>;
	loading: boolean;
	busy: boolean;
	tagsVm: TagsVm;
	onTags: (id: number, tags: Tag[]) => void;
	onRename: (token: ManagedToken, event: MouseEvent<HTMLButtonElement>) => void;
	onRevoke: (token: ManagedToken, event: MouseEvent<HTMLButtonElement>) => void;
}) {
	const assignment = (token: ManagedToken) =>
		token.channelId !== null ? (
			<TagAssignment
				vm={tagsVm}
				tags={token.tags}
				channelId={token.channelId}
				keyId={token.id}
				label={token.label}
				onChange={(tags) => onTags(token.id, tags)}
			/>
		) : (
			<span className="text-basalt-sm text-basalt-muted-foreground">Not applicable</span>
		);
	const columns: DataTableColumn<ManagedToken>[] = [
		{
			id: "token",
			header: "Token",
			sortable: false,
			wrap: true,
			headerContent: (
				<>
					<KeyRound
						className="size-basalt-icon text-basalt-tag-amber-foreground"
						aria-hidden="true"
						strokeWidth={1.5}
					/>
					Token
				</>
			),
			cellClassName: "py-basalt-panel-y align-top @min-[36rem]/tokens:align-middle",
			accessor: (token) => {
				const channel = token.channelId !== null;
				const query = token.kind === "query";
				const Icon = query ? ScanSearch : channel ? Radio : Eye;
				const tone = query
					? "bg-basalt-tag-teal text-basalt-tag-teal-foreground"
					: channel
						? "bg-basalt-tag-rose text-basalt-tag-rose-foreground"
						: "bg-basalt-tag-blue text-basalt-tag-blue-foreground";
				return (
					<div className="min-w-0 space-y-basalt-content-gap">
						<div className="flex min-w-0 items-center gap-basalt-content-gap">
							<span
								className={`hidden size-8 shrink-0 items-center justify-center rounded-basalt-md @min-[36rem]/tokens:flex ${tone}`}
							>
								<Icon className="size-basalt-icon-lg" aria-hidden="true" strokeWidth={1.5} />
							</span>
							<div className="min-w-0 flex-1">
								<p className="truncate font-medium text-basalt-foreground" title={token.label}>
									{token.label}
								</p>
								<div className="mt-basalt-space-sm flex flex-wrap items-center gap-x-basalt-content-gap gap-y-basalt-space-sm">
									<Badge variant={null} className={tone}>
										{query ? "Read only" : "Write"}
									</Badge>
									<code className="text-basalt-sm text-basalt-muted-foreground">
										{token.tokenPrefix}...
									</code>
								</div>
							</div>
						</div>
						<div className="@min-[36rem]/tokens:hidden">
							<TokenAccess token={token} compact sources={sources} />
						</div>
						{channel && (
							<div className="hidden @min-[48rem]/tokens:block @min-[60rem]/tokens:hidden">
								{assignment(token)}
							</div>
						)}
						<Collapsible className="@min-[48rem]/tokens:hidden">
							<CollapsibleTrigger asChild>
								<Button
									variant="ghost"
									size="sm"
									className="group -ms-basalt-space-lg text-basalt-muted-foreground max-sm:min-h-basalt-touch"
									aria-label={`Details for ${token.label}`}
								>
									<ChevronDown
										className="transition-transform group-data-[state=open]:rotate-180"
										aria-hidden="true"
										strokeWidth={1.5}
									/>{" "}
									Details
								</Button>
							</CollapsibleTrigger>
							<CollapsibleContent unstyled>
								<div className="space-y-basalt-content-gap pt-basalt-space-sm">
									<p className="break-words font-mono text-basalt-sm text-basalt-muted-foreground @min-[36rem]/tokens:hidden">
										{token.scopes.join(" · ")}
									</p>
									{channel && assignment(token)}
									<TokenActivity token={token} />
								</div>
							</CollapsibleContent>
						</Collapsible>
					</div>
				);
			},
		},
		{
			id: "access",
			header: "Access",
			sortable: false,
			wrap: true,
			headerContent: (
				<>
					<ShieldCheck
						className="size-basalt-icon text-basalt-tag-blue-foreground"
						aria-hidden="true"
						strokeWidth={1.5}
					/>
					Access
				</>
			),
			headerClassName: "hidden w-[32%] @min-[36rem]/tokens:table-cell @min-[60rem]/tokens:w-[24%]",
			cellClassName: "hidden @min-[36rem]/tokens:table-cell",
			accessor: (token) => <TokenAccess token={token} sources={sources} />,
		},
		{
			id: "tags",
			header: "Tags",
			sortable: false,
			wrap: true,
			headerContent: (
				<>
					<Tags
						className="size-basalt-icon text-basalt-tag-rose-foreground"
						aria-hidden="true"
						strokeWidth={1.5}
					/>
					Tags
				</>
			),
			headerClassName: "hidden w-[18%] @min-[60rem]/tokens:table-cell",
			cellClassName: "hidden @min-[60rem]/tokens:table-cell",
			accessor: assignment,
		},
		{
			id: "activity",
			header: "Last used",
			sortable: false,
			headerContent: (
				<>
					<Activity
						className="size-basalt-icon text-basalt-tag-teal-foreground"
						aria-hidden="true"
						strokeWidth={1.5}
					/>
					Last used
				</>
			),
			headerClassName: "hidden w-44 @min-[48rem]/tokens:table-cell",
			cellClassName: "hidden @min-[48rem]/tokens:table-cell",
			accessor: (token) => <TokenActivity token={token} />,
		},
		{
			id: "actions",
			header: "Actions",
			sortable: false,
			textAlign: "end",
			headerClassName: "w-[7.25rem] sm:w-24",
			cellClassName: "align-top @min-[36rem]/tokens:align-middle",
			accessor: (token) => (
				<div className="flex justify-end gap-basalt-space-sm">
					<Button
						variant="ghost"
						size="icon"
						className="max-sm:min-h-basalt-touch max-sm:min-w-basalt-touch text-basalt-tag-blue-foreground"
						aria-label={`${token.kind === "query" ? "Edit" : "Rename"} ${token.label}`}
						title={token.kind === "query" ? "Edit name and access" : "Rename token"}
						disabled={busy}
						onClick={(event) => onRename(token, event)}
					>
						<Pencil className="size-basalt-icon" aria-hidden="true" strokeWidth={1.5} />
					</Button>
					<Button
						variant="ghost"
						size="icon"
						className="max-sm:min-h-basalt-touch max-sm:min-w-basalt-touch text-basalt-muted-foreground hover:text-basalt-destructive"
						aria-label={`Revoke ${token.label}`}
						title="Revoke token"
						disabled={busy}
						onClick={(event) => onRevoke(token, event)}
					>
						<Trash2 className="size-basalt-icon" aria-hidden="true" strokeWidth={1.5} />
					</Button>
				</div>
			),
		},
	];
	return (
		<div className="@container/tokens">
			<DataTable
				aria-label={`${kind === "query" ? "Query" : kind === "channel" ? "Channel" : "Watchlist"} tokens`}
				loading={loading}
				data={tokens}
				columns={columns.filter((column) => column.id !== "tags" || kind === "channel")}
				edge="attached"
				getRowId={(token) => String(token.id)}
				className="table-fixed"
			/>
		</div>
	);
}
