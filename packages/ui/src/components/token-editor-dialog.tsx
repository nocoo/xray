import { Button, Field, Input, LayerCard } from "@nocoo/basalt";
import { Banner } from "@nocoo/basalt/components/banner";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@nocoo/basalt/components/dialog";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@nocoo/basalt/components/select";
import type { ManagedToken, QueryTokenAccess, TokenKind } from "@xray/shared";
import { useEffect, useRef, useState } from "react";
import { useUnsavedDraft } from "@/hooks/use-unsaved-draft";
import type { createTokensVm } from "@/viewmodels/tokens-vm";
import { useVm } from "@/viewmodels/use-vm";
import { CopyTextButton } from "./copy-text-button";
import { QueryTokenAccessFields } from "./query-token-access";

export function TokenEditorDialog({
	vm,
	editing,
	onClose,
	onRestoreFocus,
}: {
	vm: ReturnType<typeof createTokensVm>;
	editing: ManagedToken | null;
	onClose: () => void;
	onRestoreFocus: () => void;
}) {
	const state = useVm(vm);
	const [kind, setKind] = useState<TokenKind>(editing ? "query" : "watchlist");
	const [label, setLabel] = useState(editing?.label ?? "");
	const [channelId, setChannelId] = useState("");
	const initialAccess: QueryTokenAccess = editing?.queryAccess ?? {
		mode: "all",
		watchlistIds: [],
		channelIds: [],
	};
	const [access, setAccess] = useState(initialAccess);
	const secretInput = useRef<HTMLInputElement>(null);
	const selectedChannel = state.channels.find((channel) => channel.id === Number(channelId));
	const count = access.watchlistIds.length + access.channelIds.length;
	const invalidAccess =
		kind === "query" && access.mode === "selected" && (count === 0 || count > 100);
	useUnsavedDraft(
		state.busy ||
			(!state.secret &&
				(label !== (editing?.label ?? "") ||
					JSON.stringify(access) !== JSON.stringify(initialAccess) ||
					channelId !== "" ||
					(!editing && kind !== "watchlist"))),
	);
	useEffect(() => {
		if (state.secret) secretInput.current?.focus();
	}, [state.secret]);
	function close() {
		if (!state.busy) onClose();
	}
	return (
		<Dialog
			open
			onOpenChange={(open) => {
				if (!open) close();
			}}
		>
			<DialogContent
				size="lg"
				disablePointerDismissal
				onEscapeKeyDown={(event) => {
					if (state.busy) event.preventDefault();
				}}
				onCloseAutoFocus={(event) => {
					event.preventDefault();
					onRestoreFocus();
				}}
			>
				<DialogHeader>
					<DialogTitle>
						{state.secret ? "Token created" : editing ? "Edit query token" : "Create token"}
					</DialogTitle>
					<DialogDescription>
						{state.secret
							? "Copy this key now. You cannot view it again after closing."
							: editing
								? "Access changes take effect on the next request and invalidate existing pagination cursors."
								: "Give each agent a separate credential with only the access it needs."}
					</DialogDescription>
				</DialogHeader>
				{state.secret ? (
					<div className="mt-basalt-layout space-y-basalt-layout">
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
							Store it in your agent's secret configuration. Agent guides on this page contain
							placeholders only.
						</p>
						<DialogFooter>
							<Button onClick={close}>Done</Button>
						</DialogFooter>
					</div>
				) : (
					<form
						className="mt-basalt-layout space-y-basalt-layout"
						onSubmit={async (event) => {
							event.preventDefault();
							if (invalidAccess || (kind === "channel" && !selectedChannel)) return;
							if (editing) {
								if (await vm.updateQuery(editing, label, access)) onClose();
							} else if (kind === "query") await vm.createQuery(label, access);
							else await vm.create(label, kind === "channel" ? (selectedChannel ?? null) : null);
						}}
					>
						<Field label="Token name" htmlFor="token-name" required>
							<Input
								id="token-name"
								value={label}
								onChange={(event) => setLabel(event.target.value)}
								maxLength={64}
								required
								disabled={state.busy}
								placeholder="Daily research agent"
							/>
						</Field>
						{!editing && (
							<Field label="Token type" htmlFor="token-type">
								<Select
									value={kind}
									onValueChange={(value) => setKind(value as TokenKind)}
									disabled={state.busy}
								>
									<SelectTrigger id="token-type">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="watchlist">Watchlist ingestion</SelectItem>
										<SelectItem value="channel">Channel publishing</SelectItem>
										<SelectItem value="query">Read-only query</SelectItem>
									</SelectContent>
								</Select>
							</Field>
						)}
						{kind === "channel" && (
							<Field label="Channel" htmlFor="token-channel" required>
								<Select
									value={channelId}
									onValueChange={setChannelId}
									disabled={state.busy || state.loading}
								>
									<SelectTrigger id="token-channel">
										<SelectValue placeholder="Choose a channel" />
									</SelectTrigger>
									<SelectContent>
										{state.channels.map((channel) => (
											<SelectItem key={channel.id} value={String(channel.id)}>
												{channel.name}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</Field>
						)}
						{kind === "query" && (
							<QueryTokenAccessFields
								access={access}
								onChange={setAccess}
								watchlists={state.watchlists}
								channels={state.channels}
								disabled={state.busy || state.loading}
							/>
						)}
						<LayerCard className="text-sm text-basalt-muted-foreground">
							{kind === "query"
								? "Read-only. Up to 100 posts and articles per page. No publishing, read-state changes, or token administration."
								: kind === "channel"
									? "Publish Markdown reports to one channel. The destination cannot be changed later."
									: "Read the collection graph and push content to any watchlist in your account. No stored-content query or channel access."}
						</LayerCard>
						{kind === "channel" && !state.channels.length && (
							<p className="text-sm">
								Create a channel from Channels before issuing a publishing token.
							</p>
						)}
						{state.error && (
							<Banner role="alert" variant="error" size="sm" description={state.error} />
						)}
						<DialogFooter>
							<Button type="button" variant="outline" disabled={state.busy} onClick={close}>
								Cancel
							</Button>
							<Button
								type="submit"
								loading={state.busy}
								disabled={
									!label.trim() || invalidAccess || (kind === "channel" && !selectedChannel)
								}
							>
								{editing ? "Save changes" : "Create token"}
							</Button>
						</DialogFooter>
					</form>
				)}
			</DialogContent>
		</Dialog>
	);
}
