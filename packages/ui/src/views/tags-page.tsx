import { useEffect } from "react";
import { useBreadcrumbs } from "@/components/layout/breadcrumbs-context";
import { TagsSettings } from "@/components/tags-settings";

export function TagsPage() {
	const { setBreadcrumbs } = useBreadcrumbs();
	useEffect(() => {
		setBreadcrumbs([{ label: "Tags" }]);
		return () => setBreadcrumbs([]);
	}, [setBreadcrumbs]);
	return <TagsSettings />;
}
