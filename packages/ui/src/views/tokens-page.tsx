import { Badge, Button, ConfirmDialog, LayerCard } from "@nocoo/basalt";
import { StatCard, StatGrid } from "@nocoo/basalt/charts/stat-card";
import { Banner } from "@nocoo/basalt/components/banner";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@nocoo/basalt/components/collapsible";
import { InputGroup } from "@nocoo/basalt/components/input-group";
import { PageHeader } from "@nocoo/basalt/components/page-header";
import { SkeletonLine } from "@nocoo/basalt/components/skeleton-line";
import type { ManagedToken, TokenKind } from "@xray/shared";
import {
	BookOpen,
	Eye,
	KeyRound,
	Plus,
	Radio,
	RefreshCw,
	ScanSearch,
	Search,
	ShieldCheck,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import * as tagsApi from "@/api/tags";
import * as tokensApi from "@/api/tokens";
import { useChannels } from "@/components/channels-context";
import { CopyTextButton } from "@/components/copy-text-button";
import { useBreadcrumbs } from "@/components/layout/breadcrumbs-context";
import { SectionLabel } from "@/components/section-label";
import { TokenEditorDialog } from "@/components/token-editor-dialog";
import { TokenRenameDialog } from "@/components/token-rename-dialog";
import { TokensTable } from "@/components/tokens-table";
import { ingestBase } from "@/lib/environment";
import { tokenAgentGuide } from "@/lib/token-agent-guide";
import { createTagsVm } from "@/viewmodels/tags-vm";
import { createTokensVm, filterTokens } from "@/viewmodels/tokens-vm";
import { useVm } from "@/viewmodels/use-vm";

const sections = [
	{
		kind: "query",
		label: "Query",
		title: "Read-only query",
		description: "Read posts and articles from all or selected sources. 100 items per page.",
		icon: ScanSearch,
		tone: "text-basalt-tag-teal-foreground",
	},
	{
		kind: "watchlist",
		label: "Watchlist",
		title: "Watchlist ingestion",
		description: "Read the collection graph and push posts to your watchlists.",
		icon: Eye,
		tone: "text-basalt-tag-blue-foreground",
	},
	{
		kind: "channel",
		label: "Channel",
		title: "Channel publishing",
		description: "Publish Markdown reports. Each credential is bound to one channel.",
		icon: Radio,
		tone: "text-basalt-tag-rose-foreground",
	},
] satisfies {
	kind: TokenKind;
	label: string;
	title: string;
	description: string;
	icon: typeof Eye;
	tone: string;
}[];

export function TokensPage() {
	const vm = useMemo(() => createTokensVm(tokensApi), []);
	const tagsVm = useMemo(() => createTagsVm(tagsApi), []);
	const channelsVm = useChannels();
	const state = useVm(vm);
	const { setBreadcrumbs } = useBreadcrumbs();
	const [query, setQuery] = useState("");
	const [creating, setCreating] = useState(false);
	const [editing, setEditing] = useState<ManagedToken | null>(null);
	const [revoking, setRevoking] = useState<ManagedToken | null>(null);
	const createButton = useRef<HTMLButtonElement>(null);
	const actionButton = useRef<HTMLButtonElement | null>(null);
	useEffect(() => {
		setBreadcrumbs([{ label: "Tokens" }]);
		void vm.load();
		void tagsVm.load();
		return () => {
			vm.clearSecret();
			setBreadcrumbs([]);
		};
	}, [vm, tagsVm, setBreadcrumbs]);
	const sources = new Map([
		...state.watchlists.map((source) => [`watchlist:${source.id}`, source.name] as const),
		...state.channels.map((source) => [`channel:${source.id}`, source.name] as const),
	]);
	function restoreFocus() {
		(actionButton.current?.isConnected ? actionButton.current : createButton.current)?.focus();
	}
	function closeEditor() {
		setCreating(false);
		setEditing(null);
		vm.clearSecret();
		vm.setState({ error: null });
		void channelsVm.loadChannels();
	}
	return (
		<div className="min-w-0 space-y-basalt-layout-lg">
			<PageHeader
				title={
					<SectionLabel icon={KeyRound} tone="amber">
						Tokens
					</SectionLabel>
				}
				description="Separate credentials for reading, collecting, and publishing. Give every agent the right access."
				actions={
					<>
						<Button
							variant="outline"
							size="sm"
							disabled={state.loading || state.busy}
							onClick={() => {
								void vm.load();
								void tagsVm.load();
							}}
						>
							<RefreshCw className="size-basalt-icon" aria-hidden="true" strokeWidth={1.5} />
							Refresh
						</Button>
						<Button
							ref={createButton}
							size="sm"
							disabled={state.busy || state.loading}
							onClick={() => {
								actionButton.current = null;
								vm.setState({ error: null });
								setCreating(true);
							}}
						>
							<Plus className="size-basalt-icon" aria-hidden="true" strokeWidth={1.5} />
							Create token
						</Button>
					</>
				}
				filters={
					<div className="flex w-full flex-wrap items-center gap-basalt-layout">
						<InputGroup className="w-full sm:max-w-md">
							<InputGroup.Addon>
								<Search aria-hidden="true" strokeWidth={1.5} />
							</InputGroup.Addon>
							<InputGroup.Input
								aria-label="Search tokens"
								placeholder="Search name, prefix, channel, or tag"
								value={query}
								onChange={(event) => setQuery(event.target.value)}
							/>
						</InputGroup>
						<Badge variant="secondary" className="tabular-nums">
							{state.tokens.length} active tokens
						</Badge>
					</div>
				}
			/>
			<StatGrid columns={3} className="grid-cols-3 sm:grid-cols-3">
				{sections.map((section) => (
					<StatCard
						key={section.kind}
						label={section.label}
						value={state.tokens.filter((token) => token.kind === section.kind).length}
						icon={section.icon}
						iconColor={`hidden xl:block ${section.tone}`}
						className="bg-basalt-bright! max-sm:p-3 max-sm:[&_[data-slot=stat-card-heading]]:min-h-basalt-control-lg max-sm:[&_[data-slot=stat-card-heading]_p]:text-xs max-sm:[&_[data-slot=stat-card-value]]:text-2xl"
						status={state.loading && !state.tokens.length ? <SkeletonLine /> : undefined}
					/>
				))}
			</StatGrid>
			{state.error && !creating && !editing && !revoking && (
				<Banner role="alert" variant="error" size="sm" description={state.error} />
			)}
			{sections.map((section) => {
				const filtered = filterTokens(state.tokens, query, section.kind);
				const guide = tokenAgentGuide(section.kind, ingestBase());
				return (
					<section key={section.kind} aria-label={`${section.label} token management`}>
						<Collapsible>
							<LayerCard padding="none">
								<LayerCard.Header className="flex flex-wrap items-center justify-between gap-basalt-layout">
									<div className="min-w-0 space-y-basalt-space-sm">
										<div className="flex items-center gap-basalt-content-gap">
											<section.icon
												className={`size-basalt-icon-lg shrink-0 ${section.tone}`}
												aria-hidden="true"
												strokeWidth={1.5}
											/>
											<h2 className="text-sm font-medium">{section.title}</h2>
											<Badge variant="secondary" className="tabular-nums">
												{filtered.length}
											</Badge>
										</div>
										<p className="text-basalt-sm text-basalt-muted-foreground">
											{section.description}
										</p>
									</div>
									<div className="flex flex-wrap items-center gap-basalt-content-gap">
										<CollapsibleTrigger asChild>
											<Button
												variant="ghost"
												size="sm"
												aria-label={`View ${section.kind} agent guide`}
												className="max-sm:min-h-basalt-touch"
											>
												<BookOpen
													className="size-basalt-icon"
													aria-hidden="true"
													strokeWidth={1.5}
												/>
												Guide
											</Button>
										</CollapsibleTrigger>
										<CopyTextButton
											text={guide}
											label={`Copy ${section.kind} agent guide`}
											className="max-sm:min-h-basalt-touch"
										/>
									</div>
								</LayerCard.Header>
								<CollapsibleContent unstyled>
									<LayerCard.Body>
										<LayerCard.Well>
											<p className="mb-basalt-content-gap text-sm font-medium">
												Agent instructions · no credentials included
											</p>
											<pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words font-mono text-basalt-sm text-basalt-muted-foreground">
												{guide}
											</pre>
										</LayerCard.Well>
									</LayerCard.Body>
								</CollapsibleContent>
								{filtered.length || (state.loading && !state.tokens.length) ? (
									<TokensTable
										kind={section.kind}
										sources={sources}
										tokens={filtered}
										loading={state.loading && !state.tokens.length}
										busy={state.busy}
										tagsVm={tagsVm}
										onTags={(id, tags) => vm.setTags(id, tags)}
										onRename={(token, event) => {
											actionButton.current = event.currentTarget;
											vm.setState({ error: null });
											setEditing(token);
										}}
										onRevoke={(token, event) => {
											event.currentTarget.focus();
											actionButton.current = event.currentTarget;
											vm.setState({ error: null });
											setRevoking(token);
										}}
									/>
								) : (
									<LayerCard.Empty
										icon={<section.icon aria-hidden="true" strokeWidth={1.5} />}
										title={
											state.error
												? "Tokens unavailable"
												: query.trim()
													? "No matching tokens"
													: `No ${section.kind} tokens`
										}
										description={
											state.error
												? "Refresh to try again. No credentials have been changed."
												: query.trim()
													? "Try another name, prefix, channel, or tag."
													: `Create a token to get started with ${section.title.toLowerCase()}.`
										}
									/>
								)}
							</LayerCard>
						</Collapsible>
					</section>
				);
			})}
			<div className="flex items-start gap-basalt-content-gap text-sm text-basalt-muted-foreground">
				<ShieldCheck
					className="mt-0.5 size-basalt-icon shrink-0"
					aria-hidden="true"
					strokeWidth={1.5}
				/>
				<div className="min-w-0 space-y-basalt-space-sm">
					<p>
						Keys are shown once and stored as hashes. Revocation blocks new requests without
						deleting content.
					</p>
					<p className="break-all font-mono text-xs">{ingestBase()}</p>
				</div>
			</div>
			{(creating || editing?.kind === "query") && (
				<TokenEditorDialog
					vm={vm}
					editing={editing}
					onClose={closeEditor}
					onRestoreFocus={restoreFocus}
				/>
			)}
			{editing && editing.kind !== "query" && (
				<TokenRenameDialog
					key={editing.id}
					label={editing.label}
					busy={state.busy}
					error={state.error}
					onSave={(name) => vm.rename(editing, name)}
					onClose={closeEditor}
					onRestoreFocus={restoreFocus}
				/>
			)}
			<ConfirmDialog
				open={!!revoking}
				onCloseAutoFocus={(event) => {
					event.preventDefault();
					restoreFocus();
				}}
				onOpenChange={(open) => {
					if (!open) setRevoking(null);
				}}
				title="Revoke token?"
				description={
					<>
						<span className="[overflow-wrap:anywhere]">
							Revoke "{revoking?.label}"? Its agent will lose access immediately. Existing content
							will remain.
						</span>
						{state.error && (
							<span role="alert" className="mt-2 block text-basalt-destructive">
								{state.error}
							</span>
						)}
					</>
				}
				confirmLabel="Revoke"
				variant="destructive"
				loading={state.busy}
				onConfirm={async () => {
					if (revoking && (await vm.revoke(revoking))) {
						setRevoking(null);
						void channelsVm.loadChannels();
					}
				}}
			/>
		</div>
	);
}
