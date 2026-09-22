import { Button, Field, Input, LayerCard } from "@nocoo/basalt";
import { Banner } from "@nocoo/basalt/components/banner";
import { InputArea } from "@nocoo/basalt/components/input-area";
import { PageHeader } from "@nocoo/basalt/components/page-header";
import { StatStrip } from "@nocoo/basalt/components/stat-strip";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@nocoo/basalt/components/table";
import {
	ArrowDown,
	ArrowUp,
	BookOpen,
	FileText,
	KeyRound,
	ListOrdered,
	Plus,
	Radio,
	RefreshCw,
	Settings,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { useChannels } from "@/components/channels-context";
import { useBreadcrumbs } from "@/components/layout/breadcrumbs-context";
import { TagLabels } from "@/components/tag-labels";
import { useVm } from "@/viewmodels/use-vm";

export function ChannelsManagePage() {
	const vm = useChannels();
	const state = useVm(vm);
	const { setBreadcrumbs } = useBreadcrumbs();
	const [search, setSearch] = useSearchParams();
	const navigate = useNavigate();
	const [query, setQuery] = useState("");
	const [name, setName] = useState("");
	const [description, setDescription] = useState("");
	const creating = search.get("new") === "1";
	const channels = state.channels.filter((channel) =>
		`${channel.name} ${channel.description ?? ""}`
			.toLocaleLowerCase()
			.includes(query.trim().toLocaleLowerCase()),
	);
	useEffect(() => {
		setBreadcrumbs([{ label: "Channels" }]);
		void vm.loadChannels();
		return () => setBreadcrumbs([]);
	}, [setBreadcrumbs, vm]);

	return (
		<div className="space-y-4">
			<PageHeader
				title={
					<span className="flex items-center gap-2">
						<Radio className="h-5 w-5 text-basalt-muted-foreground" aria-hidden="true" />
						Channels
					</span>
				}
				description="Organize your reports, arrange the sidebar, and manage each channel’s push tokens."
				actions={
					<>
						<Button
							variant="outline"
							size="sm"
							disabled={state.busy || state.catalogLoading}
							onClick={() => void vm.loadChannels()}
						>
							<RefreshCw className="h-4 w-4" aria-hidden="true" /> Refresh
						</Button>
						<Button
							size="sm"
							onClick={() => setSearch({ new: "1" })}
							disabled={state.busy || creating}
						>
							<Plus className="h-4 w-4" aria-hidden="true" /> New channel
						</Button>
					</>
				}
			/>
			{state.error && <Banner variant="error" size="sm" description={state.error} />}
			<StatStrip
				className="grid-cols-3 gap-2 sm:gap-3 md:grid-cols-3 [&>div]:flex [&>div]:flex-col [&>div]:bg-basalt-bright [&>div]:p-3 sm:[&>div]:p-4 [&_dd]:mt-auto [&_dd]:pt-2"
				loading={state.catalogLoading}
				items={[
					{
						label: (
							<span className="flex flex-col items-start gap-2 sm:flex-row sm:items-center">
								<Radio className="h-4 w-4" aria-hidden="true" /> Channels
							</span>
						),
						value: state.channels.length,
					},
					{
						label: (
							<span className="flex flex-col items-start gap-2 sm:flex-row sm:items-center">
								<FileText className="h-4 w-4" aria-hidden="true" /> Reports
							</span>
						),
						value: state.channels.reduce((total, channel) => total + channel.articleCount, 0),
					},
					{
						label: (
							<span className="flex flex-col items-start gap-2 sm:flex-row sm:items-center">
								<KeyRound className="h-4 w-4" aria-hidden="true" /> Active tokens
							</span>
						),
						value: state.channels.reduce((total, channel) => total + channel.activeKeyCount, 0),
					},
				]}
			/>
			{creating && (
				<LayerCard outlined>
					<form
						className="space-y-4"
						onSubmit={async (event) => {
							event.preventDefault();
							const channel = await vm.create(name, description);
							if (channel) void navigate(`/channels/${channel.id}/settings`);
						}}
					>
						<h2 className="flex items-center gap-2 text-base font-semibold">
							<Plus className="h-4 w-4 text-basalt-muted-foreground" aria-hidden="true" /> New
							channel
						</h2>
						<div className="grid items-start gap-4 md:grid-cols-[1fr_2fr]">
							<Field label="Channel name" htmlFor="new-channel-name" required>
								<Input
									id="new-channel-name"
									value={name}
									onChange={(event) => setName(event.target.value)}
									required
									maxLength={120}
									placeholder="Research reports"
								/>
							</Field>
							<Field label="Description" htmlFor="new-channel-description" required={false}>
								<InputArea
									id="new-channel-description"
									value={description}
									onChange={(event) => setDescription(event.target.value)}
									maxLength={2000}
									rows={2}
									placeholder="What belongs in this channel?"
								/>
							</Field>
						</div>
						<div className="flex justify-end gap-2">
							<Button
								variant="outline"
								type="button"
								size="sm"
								disabled={state.busy}
								onClick={() => setSearch({})}
							>
								Cancel
							</Button>
							<Button
								type="submit"
								size="sm"
								disabled={state.busy || !name.trim()}
								loading={state.busy}
							>
								Create channel
							</Button>
						</div>
					</form>
				</LayerCard>
			)}
			<LayerCard padding="none">
				<LayerCard.Header className="flex flex-wrap items-center justify-between gap-3">
					<div>
						<h2 className="flex items-center gap-2 text-base font-semibold">
							<ListOrdered className="h-4 w-4 text-basalt-muted-foreground" aria-hidden="true" />{" "}
							Your channels
						</h2>
						<p className="text-sm text-basalt-muted-foreground">
							Use the arrows to set the sidebar order.
						</p>
					</div>
					<Input
						aria-label="Search channels"
						placeholder="Search channels…"
						className="w-full sm:w-64"
						value={query}
						onChange={(event) => setQuery(event.target.value)}
					/>
				</LayerCard.Header>
				{state.catalogLoading && !state.channels.length ? (
					<LayerCard.Loading label="Loading channels" />
				) : !channels.length ? (
					<LayerCard.Empty
						title={query ? "No matching channels" : "No channels yet"}
						description={
							query
								? "Try a different name or description."
								: "Create a channel to start collecting reports from your agents."
						}
					/>
				) : (
					<Table aria-label="Channels">
						<TableHeader>
							<TableRow>
								<TableHead>Channel</TableHead>
								<TableHead className="hidden text-right md:table-cell">Reports</TableHead>
								<TableHead className="hidden text-right lg:table-cell">Tokens</TableHead>
								<TableHead className="hidden xl:table-cell">Latest report</TableHead>
								<TableHead className="text-right">Actions</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{channels.map((channel) => {
								const index = state.channels.findIndex((item) => item.id === channel.id);
								return (
									<TableRow key={channel.id} data-channel-id={channel.id}>
										<TableCell className="w-full max-w-0">
											<Link
												to={`/channels/${channel.id}`}
												className="block truncate font-medium hover:underline"
												title={channel.name}
											>
												{channel.name}
											</Link>
											<TagLabels tags={channel.tags} />
											{channel.description && (
												<p
													className="mt-1 truncate text-xs text-basalt-muted-foreground"
													title={channel.description}
												>
													{channel.description}
												</p>
											)}
											<p className="mt-1 text-xs text-basalt-muted-foreground md:hidden">
												{channel.articleCount} reports · {channel.activeKeyCount} tokens
											</p>
										</TableCell>
										<TableCell className="hidden text-right tabular-nums md:table-cell">
											{channel.articleCount}
										</TableCell>
										<TableCell className="hidden text-right tabular-nums lg:table-cell">
											{channel.activeKeyCount}
										</TableCell>
										<TableCell className="hidden whitespace-nowrap text-basalt-muted-foreground xl:table-cell">
											{channel.latestReportDate ?? "No reports"}
										</TableCell>
										<TableCell>
											<div className="flex items-center justify-end gap-1">
												<Button
													variant="outline"
													size="icon"
													className="h-8 w-8"
													aria-label={`Move ${channel.name} up`}
													title="Move up"
													disabled={state.busy || state.catalogLoading || index === 0}
													onClick={() => void vm.move(channel.id, -1)}
												>
													<ArrowUp className="h-4 w-4" />
												</Button>
												<Button
													variant="outline"
													size="icon"
													className="h-8 w-8"
													aria-label={`Move ${channel.name} down`}
													title="Move down"
													disabled={
														state.busy ||
														state.catalogLoading ||
														index === state.channels.length - 1
													}
													onClick={() => void vm.move(channel.id, 1)}
												>
													<ArrowDown className="h-4 w-4" />
												</Button>
												<Button variant="outline" size="icon" className="h-8 w-8" asChild>
													<Link
														to={`/channels/${channel.id}`}
														aria-label={`Read ${channel.name}`}
														title="Read reports"
													>
														<BookOpen className="h-4 w-4" />
													</Link>
												</Button>
												<Button variant="outline" size="icon" className="h-8 w-8" asChild>
													<Link
														to={`/channels/${channel.id}/settings`}
														aria-label={`Manage ${channel.name}`}
														title="Channel settings"
													>
														<Settings className="h-4 w-4" aria-hidden="true" />
													</Link>
												</Button>
											</div>
										</TableCell>
									</TableRow>
								);
							})}
						</TableBody>
					</Table>
				)}
			</LayerCard>
		</div>
	);
}
