import { TagBadge } from "@nocoo/basalt/components/tag-badge";
import type { Tag } from "@xray/shared";

export function TagLabels({ tags }: { tags: Tag[] }) {
	if (!tags.length) return null;
	return (
		<span className="flex min-w-0 flex-wrap gap-1 whitespace-normal">
			{tags.map((tag) => (
				<TagBadge key={tag.id} name={tag.name} size="sm" className="[overflow-wrap:anywhere]" />
			))}
		</span>
	);
}
