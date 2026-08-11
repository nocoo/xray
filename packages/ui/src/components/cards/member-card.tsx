import { Pencil, RefreshCw, Trash2, Users } from "lucide-react";
import { memo } from "react";
import { SourceChip } from "@/components/source-chip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { MockWatchlistMember } from "@/lib/mock-data";
import { formatCount } from "@/lib/utils";

export const MemberCard = memo(function MemberCard({
	member,
	onEdit,
	onDelete,
	onRefresh,
	refreshing,
}: {
	member: MockWatchlistMember;
	onEdit?: () => void;
	onDelete?: () => void;
	onRefresh?: () => void;
	refreshing?: boolean;
}) {
	const p = member.profile;
	const displayName = p?.displayName ?? null;
	const isX = member.sourceType === "x.com";
	const avatarUrl = p?.profileImageUrl || (isX ? `https://unavatar.io/x/${member.handle}` : "");
	const profileHref = isX ? `https://x.com/${member.handle}` : undefined;
	const handleLabel = isX ? `@${member.handle}` : member.handle;

	return (
		<div
			className="group relative flex h-[200px] flex-col items-center overflow-hidden rounded-card bg-secondary px-3 pt-3 pb-2.5 text-center"
			data-source-type={member.sourceType}
		>
			<div className="absolute top-1.5 left-1.5 z-10">
				<SourceChip sourceType={member.sourceType} />
			</div>

			{(onRefresh || onEdit || onDelete) && (
				<div className="absolute top-1.5 right-1.5 z-10 flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
					{onRefresh && isX && (
						<Button
							variant="ghost"
							size="icon-xs"
							onClick={onRefresh}
							disabled={refreshing}
							title="Refresh profile"
						>
							<RefreshCw className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`} />
						</Button>
					)}
					{onEdit && (
						<Button variant="ghost" size="icon-xs" onClick={onEdit} title="Edit">
							<Pencil className="h-3 w-3" />
						</Button>
					)}
					{onDelete && (
						<Button
							variant="ghost"
							size="icon-xs"
							onClick={onDelete}
							title="Remove"
							className="text-muted-foreground hover:text-destructive"
						>
							<Trash2 className="h-3 w-3" />
						</Button>
					)}
				</div>
			)}

			<div className="flex min-h-0 w-full flex-1 flex-col items-center">
				{profileHref ? (
					<a href={profileHref} target="_blank" rel="noopener noreferrer" className="shrink-0">
						<MemberAvatar
							url={avatarUrl}
							letter={(displayName ?? member.handle)[0]?.toUpperCase() ?? "?"}
						/>
					</a>
				) : (
					<MemberAvatar
						url={avatarUrl}
						letter={(displayName ?? member.handle)[0]?.toUpperCase() ?? "?"}
					/>
				)}

				<div className="mt-1.5 flex w-full min-w-0 flex-col items-center gap-0.5">
					{displayName && (
						<div className="flex max-w-full items-center justify-center gap-1">
							<span className="truncate text-sm font-semibold leading-tight">{displayName}</span>
							{p?.isVerified && (
								<Badge variant="default" className="h-3.5 shrink-0 px-1 text-[9px]">
									V
								</Badge>
							)}
						</div>
					)}

					{profileHref ? (
						<a
							href={profileHref}
							target="_blank"
							rel="noopener noreferrer"
							className={`max-w-full truncate text-xs leading-tight hover:underline ${displayName ? "text-muted-foreground" : "font-medium text-sm"}`}
						>
							{handleLabel}
						</a>
					) : (
						<span
							className={`max-w-full truncate text-xs leading-tight ${displayName ? "text-muted-foreground" : "font-medium text-sm"}`}
						>
							{handleLabel}
						</span>
					)}
				</div>

				{p && isX && p.followersCount > 0 && (
					<div className="mt-1 flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
						<Users className="h-3 w-3" />
						<span>{formatCount(p.followersCount)}</span>
					</div>
				)}

				{member.tags.length > 0 && (
					<div className="mt-1.5 flex max-h-[22px] w-full shrink-0 flex-wrap justify-center gap-1 overflow-hidden">
						{member.tags.map((t) => (
							<span
								key={t.id}
								className="rounded-full px-1.5 py-0.5 text-[10px] font-medium leading-none text-white"
								style={{ backgroundColor: t.color }}
							>
								{t.name}
							</span>
						))}
					</div>
				)}

				{p?.description && (
					<p className="mt-1 line-clamp-2 w-full text-[10px] leading-snug text-muted-foreground">
						{p.description}
					</p>
				)}

				{member.note && (
					<p className="mt-0.5 line-clamp-1 w-full text-[10px] text-muted-foreground/70 italic">
						{member.note}
					</p>
				)}
			</div>
		</div>
	);
});

function MemberAvatar({ url, letter }: { url: string; letter: string }) {
	if (!url) {
		return (
			<div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted text-lg font-medium">
				{letter}
			</div>
		);
	}
	return (
		<img
			src={url}
			alt=""
			className="h-16 w-16 rounded-full bg-muted object-cover"
			onError={(e) => {
				const target = e.target as HTMLImageElement;
				const fallback = document.createElement("div");
				fallback.className =
					"flex h-16 w-16 items-center justify-center rounded-full bg-muted text-lg font-medium";
				fallback.textContent = letter;
				target.replaceWith(fallback);
			}}
		/>
	);
}
