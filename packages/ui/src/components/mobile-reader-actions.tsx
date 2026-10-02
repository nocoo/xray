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

const actionClassName =
	"min-h-11 w-full justify-start gap-3 px-3 text-left text-sm font-medium [&_svg]:stroke-[1.5]";

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
					arrow={false}
					collisionPadding={12}
					className="w-64 max-w-[calc(100vw-1.5rem)] p-3"
					aria-label="Reading settings"
				>
					<PopoverTitle className="text-sm font-semibold leading-5">Reading settings</PopoverTitle>
					<PopoverDescription className="mt-0.5 text-xs leading-5">
						Adjust the article typography.
					</PopoverDescription>
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
					arrow={false}
					collisionPadding={12}
					className="max-h-[var(--radix-popover-content-available-height)] w-72 max-w-[calc(100vw-1.5rem)] overflow-y-auto p-2"
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
					<div className="px-3 py-2">
						<PopoverTitle className="text-sm font-semibold leading-5">Channel actions</PopoverTitle>
						<PopoverDescription className="mt-0.5 text-xs leading-5">
							Article tools and navigation.
						</PopoverDescription>
					</div>
					<div className="flex flex-col gap-0.5">
						<CopyTextButton
							text={text}
							label="Copy full article"
							disabled={disabled}
							variant="ghost"
							size="default"
							className={actionClassName}
						/>
						<Button
							variant="ghost"
							className={actionClassName}
							disabled={disabled}
							onClick={() => select(onEdit)}
						>
							<Pencil className="h-4 w-4" aria-hidden="true" /> <span>Edit article</span>
						</Button>
						<Button
							variant="ghost"
							className={actionClassName}
							disabled={!linkCount}
							aria-label="Related links"
							aria-pressed={showLinks}
							onClick={() => select(onToggleLinks)}
						>
							<Link2 className="h-4 w-4" aria-hidden="true" />
							<span>Related links ({linkCount})</span>
						</Button>
						<Button variant="ghost" className={actionClassName} asChild>
							<Link to={`/channels/${channelId}/settings`}>
								<Settings className="h-4 w-4" aria-hidden="true" /> <span>Manage channel</span>
							</Link>
						</Button>
						<Button
							variant="ghost"
							className={`${actionClassName} text-basalt-destructive`}
							disabled={disabled}
							onClick={() => select(onDelete)}
						>
							<Trash2 className="h-4 w-4" aria-hidden="true" /> <span>Delete article</span>
						</Button>
						{onNavigate && (
							<Button
								variant="ghost"
								className={actionClassName}
								onClick={() => select(onNavigate)}
							>
								<Menu className="h-4 w-4" aria-hidden="true" /> <span>Open navigation menu</span>
							</Button>
						)}
					</div>
					{children && <div className="mt-1 border-t border-basalt-border pt-1">{children}</div>}
				</PopoverContent>
			</Popover>
		</>
	);
}
