import {
	Button,
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	Field,
	Input,
} from "@nocoo/basalt";
import { useState } from "react";
import { useNavigate } from "react-router";
import { useChannels } from "@/components/channels-context";
import {
	channelRequest,
	copyChannelText,
	ingestEndpoint,
	reportExample,
} from "@/lib/channel-reader";
import { getDataMode } from "@/lib/data-mode";
import { useVm } from "@/viewmodels/use-vm";

export function ChannelDialog({ id, onClose }: { id: number; onClose: () => void }) {
	const vm = useChannels();
	const state = useVm(vm);
	const navigate = useNavigate();
	const [name, setName] = useState(state.channels.find((c) => c.id === id)?.name ?? "");
	const [copyStatus, setCopyStatus] = useState("");
	const [label, setLabel] = useState("");
	function close() {
		void vm.manage(0);
		onClose();
	}
	return (
		<Dialog
			open
			onOpenChange={(open) => {
				if (!open) close();
			}}
		>
			<DialogContent className="max-h-[85dvh] overflow-y-auto">
				<DialogHeader>
					<DialogTitle>{id ? "Manage channel" : "New channel"}</DialogTitle>
					<DialogDescription>
						{id
							? "Rename this channel and manage its producer keys."
							: "Collect reports from your agents in one place."}
					</DialogDescription>
				</DialogHeader>
				<form
					className="grid gap-3"
					onSubmit={async (event) => {
						event.preventDefault();
						const channel = id ? await vm.rename(id, name) : await vm.create(name);
						if (channel && !id) {
							close();
							void navigate(`/channels/${channel.id}`);
						}
					}}
				>
					<Field label="Channel name">
						<Input
							aria-label="Channel name"
							value={name}
							onChange={(e) => setName(e.target.value)}
							required
							maxLength={120}
						/>
					</Field>
					<Button type="submit" disabled={state.busy || !name.trim()}>
						{id ? "Save channel" : "Create channel"}
					</Button>
				</form>
				{id > 0 && (
					<div className="grid gap-4">
						<form
							className="grid gap-3"
							onSubmit={async (event) => {
								event.preventDefault();
								await vm.createKey(label);
								setLabel("");
							}}
						>
							<Field label="Key label">
								<Input
									aria-label="Key label"
									value={label}
									onChange={(e) => setLabel(e.target.value)}
									required
									maxLength={64}
								/>
							</Field>
							<Button type="submit" disabled={state.busy || !label.trim()}>
								Create key
							</Button>
						</form>
						{state.token && (
							<div className="grid gap-2">
								<Field label="API key" hint="Copy now. This key will not be shown again.">
									<Input
										aria-label="API key"
										value={state.token}
										readOnly
										onFocus={(e) => e.target.select()}
									/>
								</Field>
								<div className="flex gap-2">
									<Button
										variant="outline"
										onClick={async () =>
											setCopyStatus(await copyChannelText(state.token || "", navigator.clipboard))
										}
									>
										Copy key
									</Button>
									<Button
										variant="outline"
										onClick={async () =>
											setCopyStatus(
												await copyChannelText(
													channelRequest(getDataMode(), state.token || ""),
													navigator.clipboard,
												),
											)
										}
									>
										Copy request
									</Button>
								</div>
								{copyStatus && (
									<p role="status" className="text-sm">
										{copyStatus}
									</p>
								)}
								<p className="text-sm text-basalt-muted-foreground">
									Save this JSON as report.json, then run the request:
								</p>
								<pre className="overflow-x-auto rounded-md bg-basalt-muted p-3 text-xs">
									{reportExample}
								</pre>
								<pre className="overflow-x-auto rounded-md bg-basalt-muted p-3 text-xs">
									{channelRequest(getDataMode(), state.token)}
								</pre>
								<p className="text-sm text-basalt-muted-foreground">POST Markdown reports to:</p>
								<code className="break-all text-xs">{ingestEndpoint(getDataMode())}</code>
								<p className="text-sm text-basalt-muted-foreground">
									Use Authorization: Bearer with this key. Required JSON fields: external_id, title,
									report_date, markdown.
								</p>
							</div>
						)}
						<ul className="grid gap-2">
							{state.keys.map((key) => (
								<li key={key.id} className="flex items-center gap-2 text-sm">
									<div className="min-w-0 flex-1">
										<p className="truncate">{key.label}</p>
										<p className="text-xs text-basalt-muted-foreground">
											{key.tokenPrefix}… ·{" "}
											{key.lastUsedAtMs
												? `Used ${new Date(key.lastUsedAtMs).toLocaleDateString()}`
												: "Never used"}
										</p>
									</div>
									<Button
										variant="ghost"
										disabled={state.busy}
										aria-label={`Revoke ${key.label}`}
										onClick={() => void vm.revoke(key.id)}
									>
										Revoke
									</Button>
								</li>
							))}
						</ul>
					</div>
				)}
				{state.error && (
					<p role="alert" className="text-sm text-basalt-destructive">
						{state.error}
					</p>
				)}
				<Button variant="ghost" onClick={close}>
					Close
				</Button>
			</DialogContent>
		</Dialog>
	);
}
