"use client";

import { IconPicker as BasaltIconPicker } from "@nocoo/basalt/components/icon-picker";
import {
	Activity,
	Bookmark,
	Brain,
	Briefcase,
	Code,
	Coins,
	Eye,
	Flame,
	Globe,
	Hash,
	Heart,
	Lightbulb,
	MessageCircle,
	Microscope,
	Music,
	Newspaper,
	Radar,
	Rocket,
	Shield,
	Star,
	Target,
	TrendingUp,
	Users,
	Zap,
	type LucideIcon,
} from "@nocoo/basalt/icons";

export const WATCHLIST_ICONS: Record<string, LucideIcon> = {
	eye: Eye,
	radar: Radar,
	brain: Brain,
	zap: Zap,
	star: Star,
	heart: Heart,
	flame: Flame,
	rocket: Rocket,
	target: Target,
	shield: Shield,
	globe: Globe,
	users: Users,
	bookmark: Bookmark,
	"trending-up": TrendingUp,
	activity: Activity,
	lightbulb: Lightbulb,
	"message-circle": MessageCircle,
	code: Code,
	coins: Coins,
	briefcase: Briefcase,
	newspaper: Newspaper,
	microscope: Microscope,
	music: Music,
	hash: Hash,
};

export const WATCHLIST_ICON_KEYS = Object.keys(WATCHLIST_ICONS);

export function resolveIcon(key: string): LucideIcon {
	return WATCHLIST_ICONS[key] ?? Eye;
}

const options = Object.entries(WATCHLIST_ICONS).map(([value, Icon]) => ({
	value,
	label: value.replaceAll("-", " "),
	icon: <Icon className="h-4 w-4" strokeWidth={1.5} />,
}));

export function IconPicker({
	value,
	onChange,
	disabled = false,
}: {
	value: string;
	onChange: (iconKey: string) => void;
	color?: string;
	disabled?: boolean;
}) {
	return (
		<BasaltIconPicker
			label="Icon"
			value={value}
			onValueChange={onChange}
			options={options}
			disabled={disabled}
			placeholder="Choose icon"
		/>
	);
}
