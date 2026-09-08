import { IconPicker } from "@nocoo/basalt/components/icon-picker";
import { WATCHLIST_ICONS } from "@/lib/watchlist-icons";

const OPTIONS = Object.entries(WATCHLIST_ICONS).map(([value, Icon]) => ({
	value,
	label: value.replaceAll("-", " "),
	icon: <Icon className="h-4 w-4" strokeWidth={1.75} />,
}));

export function WatchlistIconPicker({
	value,
	onValueChange,
}: {
	value: string;
	onValueChange: (value: string) => void;
}) {
	return (
		<IconPicker
			label="Icon"
			value={value}
			onValueChange={onValueChange}
			options={OPTIONS}
			placeholder="Choose icon"
		/>
	);
}
