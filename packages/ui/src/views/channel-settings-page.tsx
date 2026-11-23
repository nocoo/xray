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
import { PageHeader } from "@nocoo/basalt/components/page-header";
import { SectionRule } from "@nocoo/basalt/components/section-rule";
import { StatCard, StatGrid } from "@nocoo/basalt/components/stat-card";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@nocoo/basalt/components/table";
import { Textarea } from "@nocoo/basalt/components/textarea";
import {
	ArrowLeft,
	BookOpen,
	CalendarDays,
	Clock3,
	FileText,
	KeyRound,
	Pencil,
	Plus,
	Radio,
	Send,
	Settings,
	Trash2,
} from "@nocoo/basalt/icons";
import type { Channel, ChannelKey } from "@xray/shared";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import * as tagsApi from "@/api/tags";
import { useChannels } from "@/components/channels-context";
import { CopyTextButton } from "@/components/copy-text-button";
import { InlineAction } from "@/components/inline-action";
import { useBreadcrumbs } from "@/components/layout/breadcrumbs-context";
import { FormSkeleton, TableSkeleton } from "@/components/loading-skeletons";
import { RelativeTimestamp } from "@/components/relative-timestamp";
import { SectionLabel } from "@/components/section-label";
import { TagAssignment } from "@/components/tag-assignment";
import { TokenRenameDialog } from "@/components/token-rename-dialog";
import { useUnsavedDraft } from "@/hooks/use-unsaved-draft";
import { channelRequest, reportExample } from "@/lib/channel-reader";
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
			<div className="space-y-basalt-layout-lg">
				<PageHeader
					title="Channel settings"
					description="Profile and push tokens."
					actions={
						<Button variant="outline" size="sm" asChild>
							<Link to="/channels">All channels</Link>
						</Button>
					}
				/>
				{state.error && <Banner role="alert" tone="danger" size="sm" description={state.error} />}
				<LayerCard>
					{state.catalogLoading ? (
						<FormSkeleton label="Loading channel settings" paragraphs={1} />
					) : (
						<LayerCard.Empty title="Channel not found" />
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
	const [revoking, setRevoking] = useState<ChannelKey | null>(null);
	const [editingKey, setEditingKey] = useState<ChannelKey | null>(null);
	const renameButton = useRef<HTMLButtonElement | null>(null);
	const revokeButton = useRef<HTMLButtonElement | null>(null);
	const [deleting, setDeleting] = useState(false);
	const managing = state.managerId === channel.id;
	const token = managing ? state.token : null;
	useEffect(() => {
		if (token && creatingToken) tokenInput.current?.focus();
	}, [token, creatingToken]);
	const keys = managing ? state.keys : [];
	const request = channelRequest();
	const changed =
		name.trim() !== channel.name || description.trim() !== (channel.description ?? "");
	useUnsavedDraft(changed || (creatingToken && (state.busy || (!token && label !== ""))));

	return (
		<div className="min-w-0 space-y-basalt-layout-lg">
			<PageHeader
				title={
					<SectionLabel icon={Settings} tone="rose">
						{channel.name}
					</SectionLabel>
				}
				description="Profile and push tokens."
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
				<Banner role="alert" tone="danger" size="sm" description={state.error} />
			)}
			<StatGrid columns={4} className="grid-cols-2">
				{[
					{ label: "Reports", value: channel.articleCount, icon: FileText },
					{ label: "Active tokens", value: channel.activeKeyCount, icon: KeyRound },
					{ label: "Latest report", value: channel.latestReportDate ?? "—", icon: CalendarDays },
					{
						label: "Last received",
						value: channel.lastReceivedAtMs
							? new Date(channel.lastReceivedAtMs).toLocaleString()
							: "—",
						icon: Clock3,
					},
				].map((stat) => (
					<StatCard
						key={stat.label}
						label={stat.label}
						value={stat.value}
						icon={<stat.icon aria-hidden="true" strokeWidth={1.5} />}
						iconColor="hidden text-basalt-tag-rose-foreground sm:block"
						className={`bg-basalt-bright! max-sm:p-3 max-sm:[&_[data-slot=stat-card-heading]_p]:text-xs ${typeof stat.value === "string" ? "[&_[data-slot=stat-card-value]]:text-base" : "max-sm:[&_[data-slot=stat-card-value]]:text-2xl"}`}
					/>
				))}
			</StatGrid>
			<SectionRule
				title={
					<SectionLabel icon={Radio} tone="rose">
						Profile
					</SectionLabel>
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
							<div className="grid min-w-0 gap-4">
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
									<Textarea
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
							<h3 className="text-sm font-medium">Tags</h3>
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
					<SectionLabel icon={KeyRound} tone="amber">
						Push tokens
					</SectionLabel>
				}
				actions={
					<Dialog
						open={creatingToken}
						onOpenChange={(open) => {
							if (state.busy) return;
							setCreatingToken(open);
							vm.setState({ token: null, error: null });
							if (open) {
								setLabel("");
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
							{...(!token && { "aria-describedby": undefined })}
							onEscapeKeyDown={(event) => {
								if (state.busy) event.preventDefault();
							}}
						>
							<DialogHeader>
								<DialogTitle>{token ? "Token created" : "Create push token"}</DialogTitle>
								{token && <DialogDescription>This key is shown only once.</DialogDescription>}
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
									<CopyTextButton text={token} label="Copy key" className="w-full" />
									<DialogFooter>
										<Button
											disabled={state.busy}
											onClick={() => {
												setCreatingToken(false);
												vm.setState({ token: null });
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
										<Banner role="alert" tone="danger" size="sm" description={state.error} />
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
				}
			>
				<LayerCard padding="none">
					{(state.keysLoading && !keys.length) || !managing ? (
						<TableSkeleton
							label="Loading push tokens"
							columns={[
								{ label: "Name", className: "px-4 w-full" },
								{ label: "Created", className: "px-4 hidden md:table-cell" },
								{ label: "Last used", className: "px-4 hidden sm:table-cell" },
								{ label: "Actions", className: "px-4 text-right" },
							]}
						/>
					) : keys.length ? (
						<Table
							aria-label="Push tokens"
							className="[&_tr>:first-child]:ps-basalt-table-edge [&_tr>:last-child]:pe-basalt-table-edge"
						>
							<TableHeader>
								<TableRow>
									<TableHead>Name</TableHead>
									<TableHead className="hidden md:table-cell">Created</TableHead>
									<TableHead className="hidden sm:table-cell">Last used</TableHead>
									<TableHead textAlign="end" className="w-px whitespace-nowrap">
										Actions
									</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{keys.map((key) => (
									<TableRow key={key.id}>
										<TableCell className="w-full max-w-0">
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
										<TableCell className="hidden whitespace-nowrap text-basalt-muted-foreground md:table-cell">
											<RelativeTimestamp timestamp={key.createdAtMs} />
										</TableCell>
										<TableCell className="hidden whitespace-nowrap text-basalt-muted-foreground sm:table-cell">
											{key.lastUsedAtMs !== null ? (
												<RelativeTimestamp timestamp={key.lastUsedAtMs} />
											) : (
												"Never used"
											)}
										</TableCell>
										<TableCell textAlign="end">
											<div className="flex justify-end gap-basalt-space-sm">
												<InlineAction
													aria-label={`Rename ${key.label}`}
													title="Rename token"
													disabled={state.busy}
													onClick={(event) => {
														renameButton.current = event.currentTarget;
														vm.setState({ error: null });
														setEditingKey(key);
													}}
												>
													<Pencil aria-hidden="true" />
												</InlineAction>
												<InlineAction
													destructive
													aria-label={`Revoke ${key.label}`}
													title="Revoke token"
													disabled={state.busy}
													onClick={(event) => {
														event.currentTarget.focus();
														revokeButton.current = event.currentTarget;
														vm.setState({ error: null });
														setRevoking(key);
													}}
												>
													<Trash2 aria-hidden="true" />
												</InlineAction>
											</div>
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					) : (
						<LayerCard.Empty
							icon={<KeyRound aria-hidden="true" strokeWidth={1.5} />}
							title="No push tokens"
						/>
					)}
				</LayerCard>
			</SectionRule>
			<SectionRule
				title={
					<SectionLabel icon={Send} tone="blue">
						Submit a report
					</SectionLabel>
				}
				actions={
					<CopyTextButton
						key={request}
						label="Copy example"
						text={`cat > report.json <<'JSON'\n${reportExample}\nJSON\n\n${request}`}
					/>
				}
			>
				<LayerCard>
					<div className="grid min-w-0 gap-3 xl:grid-cols-2">
						<div className="flex min-w-0 flex-col gap-2">
							<h3 className="text-sm font-medium">1. Save as report.json</h3>
							<CodeBlock className="flex-1 text-xs">{reportExample}</CodeBlock>
						</div>
						<div className="flex min-w-0 flex-col gap-2">
							<h3 className="text-sm font-medium">2. Submit with your token</h3>
							<CodeBlock className="flex-1 text-xs">{request}</CodeBlock>
						</div>
					</div>
				</LayerCard>
			</SectionRule>
			<SectionRule
				title={
					<SectionLabel icon={Trash2} tone="neutral">
						Danger zone
					</SectionLabel>
				}
				actions={
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
				}
			/>
			{editingKey && (
				<TokenRenameDialog
					key={editingKey.id}
					label={editingKey.label}
					busy={state.busy}
					error={state.error}
					onSave={async (name) => vm.renameKey(editingKey.id, name)}
					onClose={() => setEditingKey(null)}
					onRestoreFocus={() => {
						(renameButton.current?.isConnected
							? renameButton.current
							: createTokenButton.current
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
						: createTokenButton.current
					)?.focus();
				}}
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
