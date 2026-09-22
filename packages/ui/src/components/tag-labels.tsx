import { TagBadge } from "@nocoo/basalt/components/tag-badge";
import type { Tag } from "@xray/shared";

export function TagLabels({ tags }: { tags: Tag[] }) {
	return (
		<span className="flex min-w-0 flex-wrap gap-1">
			{tags.map((tag) => (
				<TagBadge key={tag.id} name={tag.name} size="sm" className="[overflow-wrap:anywhere]" />
			))}
		</span>
	);
}
