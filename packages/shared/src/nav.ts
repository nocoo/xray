/** v2 sidebar navigation — single source for UI + smoke asserts. */
export type NavItemDef = {
	readonly href: string;
	readonly label: string;
	readonly icon: string;
};

export type NavGroupDef = {
	readonly label: string;
	readonly defaultOpen?: boolean;
	readonly items: readonly NavItemDef[];
};

export const V2_NAV_GROUPS: readonly NavGroupDef[] = [
	{
		label: "Dashboard",
		defaultOpen: true,
		items: [{ href: "/", label: "Dashboard", icon: "LayoutDashboard" }],
	},
	{
		label: "Watchlists",
		defaultOpen: true,
		items: [{ href: "/watchlist", label: "Watchlists", icon: "Eye" }],
	},
	{
		label: "Groups",
		defaultOpen: true,
		items: [{ href: "/groups", label: "Groups", icon: "Users" }],
	},
	{
		label: "Integrations",
		defaultOpen: true,
		items: [{ href: "/integrations/zheto", label: "zhe.to", icon: "Link" }],
	},
	{
		label: "Settings",
		defaultOpen: true,
		items: [
			{ href: "/ai-settings", label: "AI Settings", icon: "Brain" },
			{ href: "/settings", label: "Settings", icon: "Settings" },
			{ href: "/settings/tokens", label: "Push Tokens", icon: "KeyRound" },
		],
	},
] as const;

export const V2_NAV_LABELS: readonly string[] = V2_NAV_GROUPS.flatMap((g) =>
	g.items.map((i) => i.label),
);
