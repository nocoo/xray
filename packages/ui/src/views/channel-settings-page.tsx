import { Button, ConfirmDialog, Field, Input, LayerCard } from "@nocoo/basalt";
import { Banner } from "@nocoo/basalt/components/banner";
import { CodeBlock } from "@nocoo/basalt/components/code";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@nocoo/basalt/components/dialog";
import { InputArea } from "@nocoo/basalt/components/input-area";
import { PageHeader } from "@nocoo/basalt/components/page-header";
import { SectionRule } from "@nocoo/basalt/components/section-rule";
import { StatStrip } from "@nocoo/basalt/components/stat-strip";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@nocoo/basalt/components/table";
import type { Channel, ChannelKey } from "@xray/shared";
import {
	ArrowLeft,
	BookOpen,
	CalendarDays,
	Clock3,
	Copy,
	FileText,
	KeyRound,
	Plus,
	Radio,
	Send,
	Settings,
	Trash2,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import * as tagsApi from "@/api/tags";
import { useChannels } from "@/components/channels-context";
import { useBreadcrumbs } from "@/components/layout/breadcrumbs-context";
import { TagAssignment } from "@/components/tag-assignment";
import {
	channelRequest,
	copyChannelText,
	ingestEndpoint,
	reportExample,
} from "@/lib/channel-reader";
import { getDataMode } from "@/lib/data-mode";
import { createTagsVm } from "@/viewmodels/tags-vm";
import { useVm } from "@/viewmodels/use-vm";

export function ChannelSettingsPage() {
	const id = Number(useParams().channelId);
	const vm = useChannels();
	const state = useVm(vm);
	const channel = state.channels.find((item) => item.id === id);
	const { setBreadcrumbs } = useBreadcrumbs();
	useEffect(() => {
		setBreadcrumbs([
			{ label: "Channels", href: "/channels" },
			{ label: channel?.name ?? "Channel settings" },
		]);
		return () => setBreadcrumbs([]);
	}, [setBreadcrumbs, channel?.name]);
	useEffect(() => {
		void vm.manage(id);
		void vm.loadChannels();
		return () => {
			void vm.manage(0);
		};
	}, [id, vm]);
	if (!channel)
		return (
			<div className="space-y-4">
				<PageHeader
					title="Channel settings"
					description="Manage this channel and its push tokens."
					actions={
						<Button variant="outline" size="sm" asChild>
							<Link to="/channels">All channels</Link>
						</Button>
					}
				/>
				{state.error && <Banner role="alert" variant="error" size="sm" description={state.error} />}
				<LayerCard>
					{state.catalogLoading ? (
						<LayerCard.Loading />
					) : (
						<LayerCard.Empty
							title="Channel not found"
							description="Choose a channel from the management page."
						/>
					)}
				</LayerCard>
			</div>
		);
	return <ChannelSettings key={id} channel={channel} />;
}

function ChannelSettings({ channel }: { channel: Channel }) {
	const tagsVm = useMemo(() => createTagsVm(tagsApi), []);
	useEffect(() => {
		void tagsVm.load();
	}, [tagsVm]);
	const vm = useChannels();
	const state = useVm(vm);
	const navigate = useNavigate();
	const [name, setName] = useState(channel.name);
	const [description, setDescription] = useState(channel.description ?? "");
	const [creatingToken, setCreatingToken] = useState(false);
	const createTokenButton = useRef<HTMLButtonElement>(null);
	const tokenInput = useRef<HTMLInputElement>(null);
	const [label, setLabel] = useState("");
	const [saved, setSaved] = useState(false);
	const [copyStatus, setCopyStatus] = useState("");
	const [revoking, setRevoking] = useState<ChannelKey | null>(null);
	const [deleting, setDeleting] = useState(false);
	const managing = state.managerId === channel.id;
	const token = managing ? state.token : null;
	useEffect(() => {
		if (token && creatingToken) tokenInput.current?.focus();
	}, [token, creatingToken]);
	const keys = managing ? state.keys : [];
	const request = channelRequest(getDataMode(), "YOUR_CHANNEL_TOKEN");
	const changed =
		name.trim() !== channel.name || description.trim() !== (channel.description ?? "");

	return (
		<div className="min-w-0 space-y-5">
			<PageHeader
				title={
					<span className="flex items-center gap-2">
						<Settings
							className="h-5 w-5 shrink-0 text-basalt-muted-foreground"
							aria-hidden="true"
						/>
						<span className="min-w-0 [overflow-wrap:anywhere]">{channel.name}</span>
					</span>
				}
				description="Channel settings · Profile, activity, and push tokens."
				actions={
					<>
						<Button variant="outline" size="sm" asChild>
							<Link to="/channels">
								<ArrowLeft className="h-4 w-4" /> All channels
							</Link>
						</Button>
						<Button variant="outline" size="sm" asChild>
							<Link to={`/channels/${channel.id}`}>
								<BookOpen className="h-4 w-4" /> Read reports
							</Link>
						</Button>
					</>
				}
			/>
			{!creatingToken && !revoking && !deleting && state.error && (
				<Banner role="alert" variant="error" size="sm" description={state.error} />
			)}
			<StatStrip
				className="md:grid-cols-2 xl:grid-cols-4 [&>div]:bg-basalt-bright"
				items={[
					{
						label: (
							<span className="flex flex-col items-start gap-2 sm:flex-row sm:items-center">
								<FileText className="h-4 w-4" aria-hidden="true" /> Reports
							</span>
						),
						value: channel.articleCount,
					},
					{
						label: (
							<span className="flex flex-col items-start gap-2 sm:flex-row sm:items-center">
								<KeyRound className="h-4 w-4" aria-hidden="true" /> Active tokens
							</span>
						),
						value: channel.activeKeyCount,
					},
					{
						label: (
							<span className="flex flex-col items-start gap-2 sm:flex-row sm:items-center">
								<CalendarDays className="h-4 w-4" aria-hidden="true" /> Latest report
							</span>
						),
						value: <span className="text-sm">{channel.latestReportDate ?? "—"}</span>,
					},
					{
						label: (
							<span className="flex flex-col items-start gap-2 sm:flex-row sm:items-center">
								<Clock3 className="h-4 w-4" aria-hidden="true" /> Last received
							</span>
						),
						value: (
							<span className="text-sm">
								{channel.lastReceivedAtMs
									? new Date(channel.lastReceivedAtMs).toLocaleString()
									: "—"}
							</span>
						),
					},
				]}
			/>
			<SectionRule
				title={
					<span className="flex items-center gap-2">
						<Radio className="h-4 w-4 text-basalt-muted-foreground" aria-hidden="true" /> Profile
					</span>
				}
			>
				<LayerCard padding="none">
					<LayerCard.Body className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
						<form
							className="min-w-0 space-y-4"
							onSubmit={async (event) => {
								event.preventDefault();
								if (await vm.update(channel.id, name, description)) setSaved(true);
							}}
						>
							<div className="grid min-w-0 items-start gap-4 sm:grid-cols-2">
								<Field label="Channel name" htmlFor="channel-name" required>
									<Input
										id="channel-name"
										value={name}
										required
										maxLength={120}
										onChange={(event) => {
											setName(event.target.value);
											setSaved(false);
										}}
									/>
								</Field>
								<Field label="Description" htmlFor="channel-description" required={false}>
									<InputArea
										id="channel-description"
										value={description}
										rows={2}
										maxLength={2000}
										onChange={(event) => {
											setDescription(event.target.value);
											setSaved(false);
										}}
									/>
								</Field>
							</div>
							<div className="flex flex-wrap items-center justify-end gap-3 border-t border-basalt-border pt-4">
								{saved && (
									<p role="status" className="text-sm text-basalt-muted-foreground">
										Saved
									</p>
								)}
								<Button size="sm" type="submit" disabled={state.busy || !name.trim() || !changed}>
									Save changes
								</Button>
							</div>
						</form>
						<div className="min-w-0 space-y-3 border-t border-basalt-border pt-4 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-6">
							<div>
								<h3 className="text-sm font-medium">Tags</h3>
								<p className="mt-1 text-sm text-basalt-muted-foreground">
									Organize this channel with shared labels. Changes save immediately.
								</p>
							</div>
							<TagAssignment
								vm={tagsVm}
								tags={channel.tags}
								channelId={channel.id}
								label="channel"
								onChange={(tags) => {
									vm.setState((s) => ({
										channels: s.channels.map((item) =>
											item.id === channel.id ? { ...item, tags } : item,
										),
									}));
									void vm.loadChannels();
								}}
							/>
						</div>
					</LayerCard.Body>
				</LayerCard>
			</SectionRule>
			<SectionRule
				title={
					<span className="flex items-center gap-2">
						<KeyRound className="h-4 w-4 text-basalt-muted-foreground" aria-hidden="true" /> Push
						tokens
					</span>
				}
				hint="Each token can submit reports only to this channel."
			>
				<LayerCard padding="none">
					<LayerCard.Header className="flex flex-wrap items-center justify-between gap-3">
						<div>
							<h3 className="text-sm font-medium text-basalt-foreground">Named push tokens</h3>
							<p className="mt-1 text-sm">Use a separate token for each producer.</p>
						</div>
						<Dialog
							open={creatingToken}
							onOpenChange={(open) => {
								if (state.busy) return;
								setCreatingToken(open);
								vm.setState({ token: null, error: null });
								if (open) {
									setLabel("");
									setCopyStatus("");
								}
							}}
						>
							<DialogTrigger asChild>
								<Button
									ref={createTokenButton}
									size="sm"
									disabled={state.busy || state.keysLoading || !managing}
								>
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
									<DialogTitle>{token ? "Token created" : "Create push token"}</DialogTitle>
									<DialogDescription>
										{token
											? "Copy this key now. You will not be able to view it again after closing."
											: "Name the agent or integration that will submit reports to this channel."}
									</DialogDescription>
								</DialogHeader>
								{token ? (
									<div className="mt-5 space-y-4">
										<Field label="API key" htmlFor="channel-api-key">
											<Input
												id="channel-api-key"
												ref={tokenInput}
												value={token}
												readOnly
												className="font-mono text-xs"
												onFocus={(event) => event.target.select()}
											/>
										</Field>
										<Button
											variant="outline"
											className="w-full"
											onClick={async () =>
												setCopyStatus(await copyChannelText(token, navigator.clipboard))
											}
										>
											<Copy className="h-4 w-4" aria-hidden="true" />
											Copy key
										</Button>
										{copyStatus && (
											<p role="status" className="text-sm text-basalt-muted-foreground">
												{copyStatus}
											</p>
										)}
										<DialogFooter>
											<Button
												disabled={state.busy}
												onClick={() => {
													setCreatingToken(false);
													vm.setState({ token: null });
													setCopyStatus("");
												}}
											>
												Done
											</Button>
										</DialogFooter>
									</div>
								) : (
									<form
										className="mt-5 space-y-4"
										onSubmit={async (event) => {
											event.preventDefault();
											if (!state.busy) await vm.createKey(label);
										}}
									>
										<Field label="Token name" htmlFor="channel-token-name" required>
											<Input
												id="channel-token-name"
												placeholder="Daily research agent"
												value={label}
												required
												maxLength={64}
												disabled={state.busy}
												onChange={(event) => setLabel(event.target.value)}
											/>
										</Field>
										{state.error && (
											<Banner role="alert" variant="error" size="sm" description={state.error} />
										)}
										<DialogFooter>
											<Button
												type="button"
												variant="outline"
												disabled={state.busy}
												onClick={() => setCreatingToken(false)}
											>
												Cancel
											</Button>
											<Button
												type="submit"
												loading={state.busy}
												disabled={!label.trim() || state.keysLoading || !managing}
											>
												Create token
											</Button>
										</DialogFooter>
									</form>
								)}
							</DialogContent>
						</Dialog>
					</LayerCard.Header>
					{state.keysLoading || !managing ? (
						<LayerCard.Loading label="Loading push tokens" />
					) : keys.length ? (
						<Table aria-label="Push tokens">
							<TableHeader>
								<TableRow>
									<TableHead className="px-4">Name</TableHead>
									<TableHead className="px-4 hidden md:table-cell">Created</TableHead>
									<TableHead className="px-4 hidden sm:table-cell">Last used</TableHead>
									<TableHead className="px-4 w-px whitespace-nowrap text-right">Actions</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{keys.map((key) => (
									<TableRow key={key.id}>
										<TableCell className="px-4 w-full max-w-0">
											<p className="truncate font-medium" title={key.label}>
												{key.label}
											</p>
											<p className="mt-1 truncate font-mono text-xs text-basalt-muted-foreground">
												{key.tokenPrefix}…
											</p>
											<div className="mt-2 min-w-0">
												<TagAssignment
													vm={tagsVm}
													tags={key.tags}
													channelId={channel.id}
													keyId={key.id}
													label={key.label}
													onChange={(tags) => {
														vm.setState((s) => ({
															keys: s.keys.map((item) =>
																item.id === key.id ? { ...item, tags } : item,
															),
														}));
														void vm.loadChannels();
													}}
												/>
											</div>
										</TableCell>
										<TableCell className="px-4 hidden whitespace-nowrap text-basalt-muted-foreground md:table-cell">
											{new Date(key.createdAtMs).toLocaleDateString()}
										</TableCell>
										<TableCell className="px-4 hidden whitespace-nowrap text-basalt-muted-foreground sm:table-cell">
											{key.lastUsedAtMs
												? new Date(key.lastUsedAtMs).toLocaleString()
												: "Never used"}
										</TableCell>
										<TableCell className="px-4 text-right">
											<Button
												variant="outline"
												size="sm"
												aria-label={`Revoke ${key.label}`}
												disabled={state.busy}
												onClick={(event) => {
													event.currentTarget.focus();
													vm.setState({ error: null });
													setRevoking(key);
												}}
											>
												Revoke
											</Button>
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					) : (
						<LayerCard.Empty
							title="No push tokens"
							description="Create a named token for each agent or page that sends reports here."
						/>
					)}
				</LayerCard>
			</SectionRule>
			<SectionRule
				title={
					<span className="flex items-center gap-2">
						<Send className="h-4 w-4 text-basalt-muted-foreground" aria-hidden="true" /> Submit a
						report
					</span>
				}
				actions={
					<Button
						variant="outline"
						size="sm"
						onClick={async () =>
							setCopyStatus(
								await copyChannelText(
									`cat > report.json <<'JSON'\n${reportExample}\nJSON\n\n${request}`,
									navigator.clipboard,
								),
							)
						}
					>
						<Copy className="h-4 w-4" /> Copy example
					</Button>
				}
			>
				<LayerCard className="space-y-3">
					<p className="text-sm text-basalt-muted-foreground">
						Send Markdown text and external image URLs. Each token delivers only to this channel.
					</p>
					<p className="break-all font-mono text-xs">POST {ingestEndpoint(getDataMode())}</p>
					<div className="grid min-w-0 gap-3 xl:grid-cols-2">
						<div className="min-w-0 space-y-2">
							<h3 className="text-sm font-medium">1. Save as report.json</h3>
							<CodeBlock className="text-xs">{reportExample}</CodeBlock>
						</div>
						<div className="min-w-0 space-y-2">
							<h3 className="text-sm font-medium">2. Submit with your token</h3>
							<CodeBlock className="text-xs">{request}</CodeBlock>
						</div>
					</div>
					{copyStatus && (
						<p role="status" className="text-sm text-basalt-muted-foreground">
							{copyStatus}
						</p>
					)}
				</LayerCard>
			</SectionRule>
			<SectionRule
				title={
					<span className="flex items-center gap-2">
						<Trash2 className="h-4 w-4 text-basalt-muted-foreground" aria-hidden="true" /> Delete
						channel
					</span>
				}
			>
				<LayerCard className="flex flex-wrap items-center justify-between gap-4">
					<p className="text-sm text-basalt-muted-foreground">
						Permanently delete this channel, its reports, and all of its push tokens.
					</p>
					<Button
						variant="outline"
						className="text-basalt-destructive"
						disabled={state.busy}
						onClick={(event) => {
							event.currentTarget.focus();
							vm.setState({ error: null });
							setDeleting(true);
						}}
					>
						Delete channel
					</Button>
				</LayerCard>
			</SectionRule>
			<ConfirmDialog
				open={!!revoking}
				onOpenChange={(open) => {
					if (!open) setRevoking(null);
				}}
				title="Revoke push token?"
				description={
					<>
						<span className="[overflow-wrap:anywhere]">
							Revoke “{revoking?.label}”? This token will immediately stop accepting reports.
							Existing reports will remain.
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
					if (revoking && (await vm.revoke(revoking.id))) {
						setRevoking(null);
						createTokenButton.current?.focus();
					}
				}}
			/>
			<ConfirmDialog
				open={deleting}
				onOpenChange={setDeleting}
				title="Delete channel?"
				description={
					<>
						<span className="[overflow-wrap:anywhere]">
							Delete “{channel.name}” and its {channel.articleCount} reports? All push tokens will
							stop working. This cannot be undone.
						</span>
						{state.error && (
							<span role="alert" className="mt-2 block text-basalt-destructive">
								{state.error}
							</span>
						)}
					</>
				}
				confirmLabel="Delete channel"
				variant="destructive"
				loading={state.busy}
				onConfirm={async () => {
					if (await vm.remove(channel.id)) void navigate("/channels", { replace: true });
				}}
			/>
		</div>
	);
}
