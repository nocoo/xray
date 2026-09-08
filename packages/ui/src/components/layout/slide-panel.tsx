import { Button, Sheet, SheetContent, SheetTitle } from "@nocoo/basalt";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export type SlidePanelProps = {
	open: boolean;
	onClose: () => void;
	title: string;
	children: React.ReactNode;
	width?: string;
	"data-testid"?: string;
};

/** Right-edge slide-in panel wrapping Basalt Sheet. */
export function SlidePanel({
	open,
	onClose,
	title,
	children,
	width = "w-full max-w-80",
	"data-testid": testId,
}: SlidePanelProps) {
	return (
		<Sheet
			open={open}
			onOpenChange={(next) => {
				if (!next) onClose();
			}}
		>
			<SheetContent side="right" data-testid={testId} className={cn("gap-0 p-0", width)}>
				<div className="flex shrink-0 items-center justify-between border-b border-basalt-border px-4 py-3">
					<SheetTitle className="text-sm font-semibold">{title}</SheetTitle>
					<Button
						type="button"
						variant="ghost"
						size="icon"
						className="h-8 w-8"
						onClick={onClose}
						aria-label="Close panel"
					>
						<X className="h-4 w-4" />
					</Button>
				</div>
				<div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
			</SheetContent>
		</Sheet>
	);
}
