import { type NavGroupDef, V2_NAV_GROUPS } from "@xray/shared";
import {
	Brain,
	Eye,
	KeyRound,
	LayoutDashboard,
	Link as LinkIcon,
	type LucideIcon,
	Settings,
	Users,
} from "lucide-react";

const ICON_MAP: Record<string, LucideIcon> = {
	LayoutDashboard,
	Eye,
	Users,
	Link: LinkIcon,
	Brain,
	Settings,
	KeyRound,
};

export type UiNavItem = {
	href: string;
	label: string;
	icon: LucideIcon;
};

export type UiNavGroup = {
	label: string;
	defaultOpen: boolean;
	items: UiNavItem[];
};

export function getV2NavGroups(): UiNavGroup[] {
	return V2_NAV_GROUPS.map((g: NavGroupDef) => ({
		label: g.label,
		defaultOpen: g.defaultOpen ?? true,
		items: g.items.map((item) => ({
			href: item.href,
			label: item.label,
			icon: ICON_MAP[item.icon] ?? LayoutDashboard,
		})),
	}));
}

export function isActivePath(pathname: string, href: string): boolean {
	if (href === "/") return pathname === "/";
	return pathname === href || pathname.startsWith(`${href}/`);
}
