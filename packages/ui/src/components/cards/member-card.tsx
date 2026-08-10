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
			className="group relative flex flex-col items-center rounded-card bg-secondary p-4 text-center"
			data-source-type={member.sourceType}
		>
			<div className="absolute top-2 left-2">
				<SourceChip sourceType={member.sourceType} />
			</div>

			{(onRefresh || onEdit || onDelete) && (
				<div className="absolute top-2 right-2 flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
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
							className="text-destructive hover:text-destructive"
						>
							<Trash2 className="h-3 w-3" />
						</Button>
					)}
				</div>
			)}

			{profileHref ? (
				<a href={profileHref} target="_blank" rel="noopener noreferrer">
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

			{displayName && (
				<div className="flex max-w-full items-center justify-center gap-1">
					<span className="truncate text-sm font-semibold">{displayName}</span>
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
					className={`max-w-full truncate text-sm hover:underline ${displayName ? "text-muted-foreground" : "font-medium"}`}
				>
					{handleLabel}
				</a>
			) : (
				<span
					className={`max-w-full truncate text-sm ${displayName ? "text-muted-foreground" : "font-medium"}`}
				>
					{handleLabel}
				</span>
			)}

			{p && isX && p.followersCount > 0 && (
				<div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
					<Users className="h-3 w-3" />
					<span>{formatCount(p.followersCount)}</span>
				</div>
			)}

			{member.tags.length > 0 && (
				<div className="mt-1.5 flex flex-wrap justify-center gap-1">
					{member.tags.map((t) => (
						<span
							key={t.id}
							className="rounded-full px-2 py-0.5 text-[10px] font-medium text-white"
							style={{ backgroundColor: t.color }}
						>
							{t.name}
						</span>
					))}
				</div>
			)}

			{p?.description && (
				<p className="mt-1.5 line-clamp-2 text-[11px] text-muted-foreground">{p.description}</p>
			)}

			{member.note && (
				<p className="mt-1 line-clamp-1 text-[11px] text-muted-foreground/70 italic">
					{member.note}
				</p>
			)}
		</div>
	);
});

function MemberAvatar({ url, letter }: { url: string; letter: string }) {
	if (!url) {
		return (
			<div className="mb-2 flex h-[90px] w-[90px] items-center justify-center rounded-full bg-muted text-2xl font-medium">
				{letter}
			</div>
		);
	}
	return (
		<img
			src={url}
			alt=""
			className="mb-2 h-[90px] w-[90px] rounded-full bg-muted object-cover"
			onError={(e) => {
				const target = e.target as HTMLImageElement;
				const fallback = document.createElement("div");
				fallback.className =
					"mb-2 flex h-[90px] w-[90px] items-center justify-center rounded-full bg-muted text-2xl font-medium";
				fallback.textContent = letter;
				target.replaceWith(fallback);
			}}
		/>
	);
}
