import { Button, LayerCard } from "@nocoo/basalt";
import { Pencil, RefreshCw, Trash2, Users } from "lucide-react";
import { memo } from "react";
import { XVerified } from "@/components/icons/x-verified";
import { SourceChip } from "@/components/source-chip";
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
	const letter = (displayName ?? member.handle)[0]?.toUpperCase() ?? "?";

	const nameBlock = (
		<div className="flex min-w-0 items-center gap-1">
			<span className="truncate text-sm font-semibold leading-tight">
				{displayName ?? handleLabel}
			</span>
			{p?.isVerified && <XVerified className="h-3.5 w-3.5 shrink-0" />}
		</div>
	);

	const handleBlock = displayName ? (
		profileHref ? (
			<a
				href={profileHref}
				target="_blank"
				rel="noopener noreferrer"
				className="truncate text-xs text-basalt-muted-foreground leading-tight hover:underline"
				onClick={(e) => e.stopPropagation()}
			>
				{handleLabel}
			</a>
		) : (
			<span className="truncate text-xs text-basalt-muted-foreground leading-tight">
				{handleLabel}
			</span>
		)
	) : null;

	return (
		<LayerCard
			className="group relative flex animate-fade-up items-start gap-3"
			padding="sm"
			data-source-type={member.sourceType}
		>
			{/* Avatar */}
			{profileHref ? (
				<a
					href={profileHref}
					target="_blank"
					rel="noopener noreferrer"
					className="shrink-0"
					onClick={(e) => e.stopPropagation()}
				>
					<MemberAvatar url={avatarUrl} letter={letter} />
				</a>
			) : (
				<div className="shrink-0">
					<MemberAvatar url={avatarUrl} letter={letter} />
				</div>
			)}

			{/* Body */}
			<div className="min-w-0 flex-1 pr-6">
				<div className="mb-1 flex flex-wrap items-center gap-1.5">
					<SourceChip sourceType={member.sourceType} />
					{p && isX && p.followersCount > 0 && (
						<span className="inline-flex items-center gap-0.5 text-[11px] text-basalt-muted-foreground">
							<Users className="h-3 w-3" />
							{formatCount(p.followersCount)}
						</span>
					)}
				</div>

				{profileHref && displayName ? (
					<a
						href={profileHref}
						target="_blank"
						rel="noopener noreferrer"
						className="block min-w-0 hover:underline"
						onClick={(e) => e.stopPropagation()}
					>
						{nameBlock}
					</a>
				) : (
					nameBlock
				)}
				{handleBlock}

				{member.tags.length > 0 && (
					<div className="mt-1.5 flex flex-wrap gap-1">
						{member.tags.slice(0, 4).map((t) => (
							<span
								key={t.id}
								className="rounded-full px-1.5 py-0.5 text-[10px] font-medium leading-none text-white"
								style={{ backgroundColor: t.color }}
							>
								{t.name}
							</span>
						))}
						{member.tags.length > 4 && (
							<span className="text-[10px] text-basalt-muted-foreground">
								+{member.tags.length - 4}
							</span>
						)}
					</div>
				)}

				{p?.description && (
					<p className="mt-1 line-clamp-2 text-[11px] leading-snug text-basalt-muted-foreground">
						{p.description}
					</p>
				)}

				{member.note && (
					<p className="mt-0.5 line-clamp-1 text-[11px] text-basalt-muted-foreground/70 italic">
						{member.note}
					</p>
				)}
			</div>

			{/* Actions — inside card, top-right */}
			{(onRefresh || onEdit || onDelete) && (
				<div className="absolute top-2 right-2 flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
					{onRefresh && isX && (
						<Button
							variant="ghost"
							size="icon"
							className="h-6 w-6 focus-visible:ring-offset-0"
							onClick={onRefresh}
							disabled={refreshing}
							title="Refresh profile"
						>
							<RefreshCw className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`} />
						</Button>
					)}
					{onEdit && (
						<Button
							variant="ghost"
							size="icon"
							className="h-6 w-6 focus-visible:ring-offset-0"
							onClick={onEdit}
							title="Edit"
						>
							<Pencil className="h-3 w-3" />
						</Button>
					)}
					{onDelete && (
						<Button
							variant="ghost"
							size="icon"
							className="h-6 w-6 text-basalt-muted-foreground focus-visible:ring-offset-0 hover:text-basalt-destructive"
							onClick={onDelete}
							title="Remove"
						>
							<Trash2 className="h-3 w-3" />
						</Button>
					)}
				</div>
			)}
		</LayerCard>
	);
});

function MemberAvatar({ url, letter }: { url: string; letter: string }) {
	if (!url) {
		return (
			<div className="flex h-11 w-11 items-center justify-center rounded-full bg-basalt-muted text-sm font-medium">
				{letter}
			</div>
		);
	}
	return (
		<img
			src={url}
			alt=""
			className="h-11 w-11 rounded-full bg-basalt-muted object-cover"
			onError={(e) => {
				const target = e.target as HTMLImageElement;
				const fallback = document.createElement("div");
				fallback.className =
					"flex h-11 w-11 items-center justify-center rounded-full bg-basalt-muted text-sm font-medium";
				fallback.textContent = letter;
				target.replaceWith(fallback);
			}}
		/>
	);
}
