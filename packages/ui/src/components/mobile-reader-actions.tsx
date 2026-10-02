import { Button } from "@nocoo/basalt";
import {
	Popover,
	PopoverContent,
	PopoverDescription,
	PopoverTitle,
	PopoverTrigger,
} from "@nocoo/basalt/components/popover";
import {
	AArrowDown,
	AArrowUp,
	Ellipsis,
	Link2,
	Menu,
	Pencil,
	Settings,
	Trash2,
	Type,
} from "lucide-react";
import { type ReactNode, type RefObject, useRef, useState } from "react";
import { Link } from "react-router";
import type { readPreferences } from "@/lib/channel-reader";
import { CopyTextButton } from "./copy-text-button";

type Preferences = ReturnType<typeof readPreferences>;

export function MobileReaderActions({
	channelId,
	text,
	disabled,
	preferences,
	onPreferences,
	onEdit,
	onDelete,
	linkCount,
	showLinks,
	onToggleLinks,
	triggerRef,
	onNavigate,
	children,
}: {
	channelId: number;
	text: string;
	disabled: boolean;
	preferences: Preferences;
	onPreferences: (preferences: Preferences) => void;
	onEdit: () => void;
	onDelete: () => void;
	linkCount: number;
	showLinks: boolean;
	onToggleLinks: () => void;
	triggerRef: RefObject<HTMLButtonElement | null>;
	onNavigate?: () => void;
	children?: ReactNode;
}) {
	const [open, setOpen] = useState(false);
	const pendingAction = useRef<(() => void) | null>(null);
	function select(action: () => void) {
		pendingAction.current = action;
		setOpen(false);
	}
	return (
		<>
			<Popover>
				<PopoverTrigger asChild>
					<Button variant="ghost" size="icon" className="h-11 w-11" aria-label="Reading settings">
						<Type className="h-5 w-5" aria-hidden="true" />
					</Button>
				</PopoverTrigger>
				<PopoverContent
					align="end"
					collisionPadding={12}
					className="w-64 max-w-[calc(100vw-1.5rem)]"
					aria-label="Reading settings"
				>
					<PopoverTitle>Reading settings</PopoverTitle>
					<PopoverDescription>Adjust the article typography.</PopoverDescription>
					<fieldset className="mt-3 space-y-3" aria-label="Reading preferences">
						<div className="flex items-center justify-between gap-3">
							<Button
								variant="outline"
								size="icon"
								className="h-11 w-11"
								aria-label="Decrease font size"
								disabled={preferences.size <= 16}
								onClick={() => onPreferences({ ...preferences, size: preferences.size - 2 })}
							>
								<AArrowDown className="h-5 w-5" aria-hidden="true" />
							</Button>
							<output className="text-sm tabular-nums" aria-live="polite">
								{preferences.size}px
							</output>
							<Button
								variant="outline"
								size="icon"
								className="h-11 w-11"
								aria-label="Increase font size"
								disabled={preferences.size >= 22}
								onClick={() => onPreferences({ ...preferences, size: preferences.size + 2 })}
							>
								<AArrowUp className="h-5 w-5" aria-hidden="true" />
							</Button>
						</div>
						<Button
							variant="outline"
							className="min-h-11 w-full"
							aria-label="Use sans-serif font"
							aria-pressed={preferences.sans}
							onClick={() => onPreferences({ ...preferences, sans: !preferences.sans })}
						>
							{preferences.sans ? "Sans-serif font" : "Serif font"}
						</Button>
					</fieldset>
				</PopoverContent>
			</Popover>
			<Popover open={open} onOpenChange={setOpen}>
				<PopoverTrigger asChild>
					<Button
						ref={triggerRef}
						variant="ghost"
						size="icon"
						className="h-11 w-11"
						aria-label="More channel actions"
					>
						<Ellipsis className="h-5 w-5" aria-hidden="true" />
					</Button>
				</PopoverTrigger>
				<PopoverContent
					align="end"
					collisionPadding={12}
					className="max-h-[var(--radix-popover-content-available-height)] w-72 max-w-[calc(100vw-1.5rem)] overflow-y-auto"
					aria-label="Channel actions"
					onCloseAutoFocus={(event) => {
						const action = pendingAction.current;
						pendingAction.current = null;
						if (action) {
							event.preventDefault();
							triggerRef.current?.focus({ preventScroll: true });
							action();
						}
					}}
				>
					<PopoverTitle>Channel actions</PopoverTitle>
					<PopoverDescription>Article tools and channel navigation.</PopoverDescription>
					<div className="mt-3 flex flex-col gap-1">
						<CopyTextButton
							text={text}
							label="Copy full article"
							disabled={disabled}
							className="min-h-11 justify-start"
						/>
						<Button
							variant="ghost"
							className="min-h-11 justify-start"
							disabled={disabled}
							onClick={() => select(onEdit)}
						>
							<Pencil className="h-4 w-4" aria-hidden="true" /> Edit article
						</Button>
						<Button
							variant="ghost"
							className="min-h-11 justify-start"
							disabled={!linkCount}
							aria-label="Related links"
							aria-pressed={showLinks}
							onClick={() => select(onToggleLinks)}
						>
							<Link2 className="h-4 w-4" aria-hidden="true" /> Related links ({linkCount})
						</Button>
						<Button variant="ghost" className="min-h-11 justify-start" asChild>
							<Link to={`/channels/${channelId}/settings`}>
								<Settings className="h-4 w-4" aria-hidden="true" /> Manage channel
							</Link>
						</Button>
						<Button
							variant="ghost"
							className="min-h-11 justify-start text-basalt-destructive"
							disabled={disabled}
							onClick={() => select(onDelete)}
						>
							<Trash2 className="h-4 w-4" aria-hidden="true" /> Delete article
						</Button>
					</div>
					{onNavigate && (
						<Button
							variant="ghost"
							className="mt-3 min-h-11 w-full justify-start"
							onClick={() => select(onNavigate)}
						>
							<Menu className="h-4 w-4" aria-hidden="true" /> Open navigation menu
						</Button>
					)}
					{children && <div className="mt-3 border-t border-basalt-border pt-3">{children}</div>}
				</PopoverContent>
			</Popover>
		</>
	);
}
