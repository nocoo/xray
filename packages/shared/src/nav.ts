/** v2 sidebar navigation — static groups; Watchlists/Groups/Channels children are dynamic in UI. */
export type NavItemDef = {
	readonly href: string;
	readonly label: string;
	readonly icon: string;
};

export type NavGroupDef = {
	readonly label: string;
	readonly defaultOpen?: boolean;
	/** When true, UI loads children from API (watchlists / groups). */
	readonly dynamic?: "watchlists" | "groups" | "channels";
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
		dynamic: "watchlists",
		// Fallback / collapsed single entry
		items: [{ href: "/watchlist", label: "All watchlists", icon: "Eye" }],
	},
	{
		label: "Groups",
		defaultOpen: true,
		dynamic: "groups",
		items: [{ href: "/groups", label: "All groups", icon: "Users" }],
	},
	{
		label: "Channels",
		defaultOpen: true,
		dynamic: "channels",
		items: [{ href: "/channels", label: "All channels", icon: "Radio" }],
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
			{ href: "/channels", label: "Channels", icon: "Radio" },
			{ href: "/tags", label: "Tags", icon: "Tag" },
			{ href: "/settings", label: "Settings", icon: "Settings" },
		],
	},
] as const;

export const V2_NAV_LABELS: readonly string[] = V2_NAV_GROUPS.flatMap((g) =>
	g.items.map((i) => i.label),
);
