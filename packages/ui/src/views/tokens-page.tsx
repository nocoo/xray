import { Badge, Button, ConfirmDialog, Field, Input, LayerCard } from "@nocoo/basalt";
import { StatCard, StatGrid } from "@nocoo/basalt/charts/stat-card";
import { Banner } from "@nocoo/basalt/components/banner";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@nocoo/basalt/components/dialog";
import { PageHeader } from "@nocoo/basalt/components/page-header";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@nocoo/basalt/components/select";
import { SkeletonLine } from "@nocoo/basalt/components/skeleton-line";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@nocoo/basalt/components/table";
import type { ManagedToken } from "@xray/shared";
import {
	ArrowUpRight,
	KeyRound,
	Pencil,
	Plus,
	RefreshCw,
	Search,
	ShieldCheck,
	Trash2,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import * as tagsApi from "@/api/tags";
import * as tokensApi from "@/api/tokens";
import { useChannels } from "@/components/channels-context";
import { CopyTextButton } from "@/components/copy-text-button";
import { useBreadcrumbs } from "@/components/layout/breadcrumbs-context";
import { TableSkeleton } from "@/components/loading-skeletons";
import { TagAssignment } from "@/components/tag-assignment";
import { TokenRenameDialog } from "@/components/token-rename-dialog";
import { useUnsavedDraft } from "@/hooks/use-unsaved-draft";
import { ingestBase } from "@/lib/environment";
import { createTagsVm } from "@/viewmodels/tags-vm";
import { createTokensVm, filterTokens, type TokenKind } from "@/viewmodels/tokens-vm";
import { useVm } from "@/viewmodels/use-vm";

export function TokensPage() {
	const vm = useMemo(() => createTokensVm(tokensApi), []);
	const tagsVm = useMemo(() => createTagsVm(tagsApi), []);
	const channelsVm = useChannels();
	const catalog = useVm(channelsVm);
	const state = useVm(vm);
	const { setBreadcrumbs } = useBreadcrumbs();
	const [query, setQuery] = useState("");
	const [kind, setKind] = useState<TokenKind>("all");
	const [creating, setCreating] = useState(false);
	const [createKind, setCreateKind] = useState("watchlist");
	const [channelId, setChannelId] = useState("");
	const [label, setLabel] = useState("");
	const [editing, setEditing] = useState<ManagedToken | null>(null);
	const [revoking, setRevoking] = useState<ManagedToken | null>(null);
	const createButton = useRef<HTMLButtonElement>(null);
	const renameButton = useRef<HTMLButtonElement | null>(null);
	const revokeButton = useRef<HTMLButtonElement | null>(null);
	const secretInput = useRef<HTMLInputElement>(null);
	useUnsavedDraft(creating && (state.busy || (!state.secret && label !== "")));
	useEffect(() => {
		setBreadcrumbs([{ label: "Tokens" }]);
		void vm.load();
		void tagsVm.load();
		void channelsVm.loadChannels();
		return () => {
			vm.clearSecret();
			setBreadcrumbs([]);
		};
	}, [vm, tagsVm, channelsVm, setBreadcrumbs]);
	useEffect(() => {
		if (state.secret) secretInput.current?.focus();
	}, [state.secret]);
	const filtered = filterTokens(state.tokens, query, kind);
	const watchlistCount = state.tokens.filter((token) => token.channelId === null).length;
	const selectedChannel = catalog.channels.find((channel) => channel.id === Number(channelId));
	function closeCreate(open: boolean) {
		if (state.busy) return;
		setCreating(open);
		vm.clearSecret();
		vm.setState({ error: null });
		if (open) {
			setLabel("");
			setCreateKind("watchlist");
			setChannelId("");
		}
	}
	return (
		<div className="min-w-0 space-y-5">
			<PageHeader
				title="Tokens"
				description="One place for every producer. Manage watchlist ingestion and channel publishing."
				actions={
					<>
						<Button
							variant="outline"
							size="sm"
							disabled={state.loading || state.busy}
							onClick={() => {
								void vm.load();
								void tagsVm.load();
								void channelsVm.loadChannels();
							}}
						>
							<RefreshCw className="h-4 w-4" aria-hidden="true" /> Refresh
						</Button>
						<Dialog open={creating} onOpenChange={closeCreate}>
							<DialogTrigger asChild>
								<Button ref={createButton} size="sm" disabled={state.busy || state.loading}>
									<Plus className="h-4 w-4" aria-hidden="true" />
									Create token
								</Button>
							</DialogTrigger>
							<DialogContent
								disablePointerDismissal
								onEscapeKeyDown={(event) => {
									if (state.busy) event.preventDefault();
								}}
							>
								<DialogHeader>
									<DialogTitle>{state.secret ? "Token created" : "Create push token"}</DialogTitle>
									<DialogDescription>
										{state.secret
											? "Copy this key now. You will not be able to view it again after closing."
											: "Choose what this producer can publish. Its access cannot be changed later."}
									</DialogDescription>
								</DialogHeader>
								{state.secret ? (
									<div className="mt-5 space-y-4">
										<Field label="API key" htmlFor="new-token-secret">
											<Input
												id="new-token-secret"
												ref={secretInput}
												readOnly
												value={state.secret}
												className="font-mono text-xs"
												onFocus={(event) => event.target.select()}
											/>
										</Field>
										<CopyTextButton text={state.secret} label="Copy key" className="w-full" />
										<p className="text-sm text-basalt-muted-foreground">
											Store it in your producer's secret configuration, never in source control.
										</p>
										<DialogFooter>
											<Button onClick={() => closeCreate(false)}>Done</Button>
										</DialogFooter>
									</div>
								) : (
									<form
										className="mt-5 space-y-4"
										onSubmit={async (event) => {
											event.preventDefault();
											if (createKind === "channel" && !selectedChannel) return;
											if (
												await vm.create(
													label,
													createKind === "channel" ? (selectedChannel ?? null) : null,
												)
											)
												void channelsVm.loadChannels();
										}}
									>
										<Field label="Token name" htmlFor="new-token-label" required>
											<Input
												id="new-token-label"
												value={label}
												onChange={(event) => setLabel(event.target.value)}
												maxLength={64}
												required
												disabled={state.busy}
												placeholder="Daily research agent"
											/>
										</Field>
										<Field label="Token type" htmlFor="new-token-type">
											<Select
												value={createKind}
												onValueChange={setCreateKind}
												disabled={state.busy}
											>
												<SelectTrigger id="new-token-type">
													<SelectValue />
												</SelectTrigger>
												<SelectContent>
													<SelectItem value="watchlist">Watchlist ingestion</SelectItem>
													<SelectItem value="channel">Channel publishing</SelectItem>
												</SelectContent>
											</Select>
										</Field>
										{createKind === "channel" && (
											<Field label="Channel" htmlFor="new-token-channel" required>
												<Select
													value={channelId}
													onValueChange={setChannelId}
													disabled={state.busy || catalog.catalogLoading}
												>
													<SelectTrigger id="new-token-channel">
														<SelectValue placeholder="Choose a channel" />
													</SelectTrigger>
													<SelectContent>
														{catalog.channels.map((channel) => (
															<SelectItem key={channel.id} value={String(channel.id)}>
																{channel.name}
															</SelectItem>
														))}
													</SelectContent>
												</Select>
											</Field>
										)}
										<LayerCard className="text-sm text-basalt-muted-foreground">
											{createKind === "channel"
												? "Submit Markdown reports to one channel. No watchlist or administration access."
												: "Read the watchlist graph and push content to any watchlist in your account. No channel or administration access."}
										</LayerCard>
										{createKind === "channel" &&
											!catalog.catalogLoading &&
											!catalog.channels.length && (
												<p className="text-sm">
													Create a channel from Channels before issuing a publishing token.
												</p>
											)}
										{(state.error || (createKind === "channel" && catalog.error)) && (
											<Banner
												role="alert"
												variant="error"
												size="sm"
												description={state.error || catalog.error}
											/>
										)}
										<DialogFooter>
											<Button
												type="button"
												variant="outline"
												disabled={state.busy}
												onClick={() => closeCreate(false)}
											>
												Cancel
											</Button>
											<Button
												type="submit"
												loading={state.busy}
												disabled={
													!label.trim() ||
													(createKind === "channel" && (!selectedChannel || catalog.catalogLoading))
												}
											>
												Create token
											</Button>
										</DialogFooter>
									</form>
								)}
							</DialogContent>
						</Dialog>
					</>
				}
			/>
			<StatGrid columns={3} className="grid-cols-3 sm:grid-cols-3">
				{[
					{ label: "Active tokens", value: state.tokens.length },
					{ label: "Watchlist", value: watchlistCount },
					{ label: "Channel", value: state.tokens.length - watchlistCount },
				].map((stat) => (
					<StatCard
						key={stat.label}
						label={stat.label}
						value={stat.value}
						className="bg-basalt-bright"
						status={state.loading && !state.tokens.length ? <SkeletonLine /> : undefined}
					/>
				))}
			</StatGrid>
			{state.error && !creating && !editing && !revoking && (
				<Banner role="alert" variant="error" size="sm" description={state.error} />
			)}
			<LayerCard padding="none">
				<LayerCard.Header className="flex flex-wrap items-center justify-between gap-3">
					<div className="flex items-center gap-2">
						<KeyRound className="h-4 w-4 text-basalt-muted-foreground" aria-hidden="true" />
						<h2 className="text-sm font-medium">Active credentials</h2>
						<span className="text-xs tabular-nums text-basalt-muted-foreground">
							{filtered.length}
							{filtered.length !== state.tokens.length && ` / ${state.tokens.length}`}
						</span>
					</div>
					<div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
						<div className="relative min-w-0 flex-1 sm:w-64">
							<Search
								className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-basalt-muted-foreground"
								aria-hidden="true"
							/>
							<Input
								aria-label="Search tokens"
								placeholder="Search name, channel, or tag"
								className="pl-9"
								value={query}
								onChange={(event) => setQuery(event.target.value)}
							/>
						</div>
						<Select value={kind} onValueChange={(value) => setKind(value as TokenKind)}>
							<SelectTrigger aria-label="Filter token type" className="w-36">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="all">All types</SelectItem>
								<SelectItem value="watchlist">Watchlist</SelectItem>
								<SelectItem value="channel">Channel</SelectItem>
							</SelectContent>
						</Select>
					</div>
				</LayerCard.Header>
				{state.loading && !state.tokens.length ? (
					<TableSkeleton
						label="Loading tokens"
						columns={[{ label: "Producer" }, { label: "Access" }, { label: "Actions" }]}
					/>
				) : filtered.length ? (
					<Table aria-label="Active tokens" className="table-fixed">
						<TableHeader>
							<TableRow>
								<TableHead className="px-4">Producer</TableHead>
								<TableHead className="hidden w-64 px-4 lg:table-cell">Access</TableHead>
								<TableHead className="hidden w-44 px-4 md:table-cell">Activity</TableHead>
								<TableHead className="w-24 px-4 text-right">Actions</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{filtered.map((token) => (
								<TableRow key={token.id}>
									<TableCell className="px-4 py-4 align-top">
										<p className="truncate font-medium" title={token.label}>
											{token.label}
										</p>
										<div className="mt-1 flex flex-wrap items-center gap-2">
											<code className="text-xs text-basalt-muted-foreground">
												{token.tokenPrefix}...
											</code>
											<Badge variant="secondary" className="text-xs">
												{token.channelId === null ? "Watchlist" : "Channel"}
											</Badge>
										</div>
										<div className="mt-2 min-w-0 lg:hidden">
											{token.channelId === null ? (
												<span className="text-xs text-basalt-muted-foreground">
													All your watchlists
												</span>
											) : (
												<Link
													className="block truncate text-xs hover:underline"
													to={`/channels/${token.channelId}/settings`}
													title={token.channelName ?? undefined}
												>
													{token.channelName}
												</Link>
											)}
										</div>
										{token.channelId !== null && (
											<div className="mt-2">
												<TagAssignment
													vm={tagsVm}
													tags={token.tags}
													channelId={token.channelId}
													keyId={token.id}
													label={token.label}
													onChange={(tags) => vm.setTags(token.id, tags)}
												/>
											</div>
										)}
										<p className="mt-2 text-xs text-basalt-muted-foreground md:hidden">
											{token.lastUsedAtMs
												? `Used ${new Date(token.lastUsedAtMs).toLocaleDateString()}`
												: "Never used"}
										</p>
									</TableCell>
									<TableCell className="hidden px-4 py-4 align-top lg:table-cell">
										{token.channelId === null ? (
											<p className="text-sm">All your watchlists</p>
										) : (
											<Link
												className="flex min-w-0 items-center gap-1 text-sm hover:underline"
												to={`/channels/${token.channelId}/settings`}
											>
												<span className="truncate" title={token.channelName ?? undefined}>
													{token.channelName}
												</span>
												<ArrowUpRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
											</Link>
										)}
										<p className="mt-1 break-words font-mono text-xs text-basalt-muted-foreground">
											{token.scopes.join(" · ")}
										</p>
									</TableCell>
									<TableCell className="hidden px-4 py-4 align-top md:table-cell">
										<p className="text-xs">
											{token.lastUsedAtMs
												? new Date(token.lastUsedAtMs).toLocaleString()
												: "Never used"}
										</p>
										<p className="mt-1 text-xs text-basalt-muted-foreground">
											Created {new Date(token.createdAtMs).toLocaleDateString()}
										</p>
									</TableCell>
									<TableCell className="px-3 py-3 align-top">
										<div className="flex flex-col items-end gap-1 sm:flex-row sm:justify-end">
											<Button
												variant="ghost"
												size="icon"
												className="h-11 w-11 sm:h-9 sm:w-9"
												aria-label={`Rename ${token.label}`}
												title="Rename token"
												disabled={state.busy}
												onClick={(event) => {
													renameButton.current = event.currentTarget;
													vm.setState({ error: null });
													setEditing(token);
												}}
											>
												<Pencil className="h-4 w-4" aria-hidden="true" />
											</Button>
											<Button
												variant="ghost"
												size="icon"
												className="h-11 w-11 sm:h-9 sm:w-9 text-basalt-muted-foreground hover:text-basalt-destructive"
												aria-label={`Revoke ${token.label}`}
												title="Revoke token"
												disabled={state.busy}
												onClick={(event) => {
													event.currentTarget.focus();
													revokeButton.current = event.currentTarget;
													vm.setState({ error: null });
													setRevoking(token);
												}}
											>
												<Trash2 className="h-4 w-4" aria-hidden="true" />
											</Button>
										</div>
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				) : (
					<LayerCard.Empty
						title={
							state.error
								? "Tokens unavailable"
								: state.tokens.length
									? "No matching tokens"
									: "No active tokens"
						}
						description={
							state.error
								? "Refresh to try again. No credentials have been changed."
								: state.tokens.length
									? "Try another name, channel, tag, or token type."
									: "Create a separate credential for each producer to keep access easy to track and revoke."
						}
					/>
				)}
			</LayerCard>
			<div className="flex items-start gap-3 text-sm text-basalt-muted-foreground">
				<ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
				<div className="min-w-0 space-y-1">
					<p>
						Keys are shown once and stored as hashes. Revocation stops new submissions, not existing
						content.
					</p>
					<p className="break-all font-mono text-xs">{ingestBase()}</p>
				</div>
			</div>
			{editing && (
				<TokenRenameDialog
					key={editing.id}
					label={editing.label}
					busy={state.busy}
					error={state.error}
					onSave={(name) => vm.rename(editing, name)}
					onClose={() => setEditing(null)}
					onRestoreFocus={() => {
						(renameButton.current?.isConnected
							? renameButton.current
							: createButton.current
						)?.focus();
					}}
				/>
			)}
			<ConfirmDialog
				open={!!revoking}
				onCloseAutoFocus={(event) => {
					event.preventDefault();
					(revokeButton.current?.isConnected
						? revokeButton.current
						: createButton.current
					)?.focus();
				}}
				onOpenChange={(open) => {
					if (!open) setRevoking(null);
				}}
				title="Revoke push token?"
				description={
					<>
						<span className="[overflow-wrap:anywhere]">
							Revoke "{revoking?.label}"? Its producer will lose access immediately. Existing
							content will remain.
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
