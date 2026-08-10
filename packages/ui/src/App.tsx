import { BrowserRouter, Navigate, Outlet, Route, Routes } from "react-router";
import { AppShell } from "@/components/layout";
import { PlaceholderPage } from "./routes/placeholder";

function ShellLayout() {
	return (
		<AppShell>
			<Outlet />
		</AppShell>
	);
}

export function App() {
	return (
		<BrowserRouter>
			<Routes>
				<Route element={<ShellLayout />}>
					<Route path="/" element={<PlaceholderPage title="Dashboard" crumbs={[]} />} />
					<Route
						path="/watchlist"
						element={<PlaceholderPage title="Watchlists" crumbs={[{ label: "Watchlists" }]} />}
					/>
					<Route
						path="/watchlist/*"
						element={
							<PlaceholderPage
								title="Watchlist"
								crumbs={[{ label: "Watchlists", href: "/watchlist" }, { label: "Detail" }]}
							/>
						}
					/>
					<Route
						path="/groups"
						element={<PlaceholderPage title="Groups" crumbs={[{ label: "Groups" }]} />}
					/>
					<Route
						path="/groups/*"
						element={
							<PlaceholderPage
								title="Group"
								crumbs={[{ label: "Groups", href: "/groups" }, { label: "Detail" }]}
							/>
						}
					/>
					<Route
						path="/integrations/zheto"
						element={
							<PlaceholderPage
								title="zhe.to"
								crumbs={[{ label: "Integrations" }, { label: "zhe.to" }]}
							/>
						}
					/>
					<Route
						path="/ai-settings"
						element={<PlaceholderPage title="AI Settings" crumbs={[{ label: "AI Settings" }]} />}
					/>
					<Route
						path="/settings"
						element={<PlaceholderPage title="Settings" crumbs={[{ label: "Settings" }]} />}
					/>
					<Route
						path="/settings/tokens"
						element={
							<PlaceholderPage
								title="Push Tokens"
								crumbs={[{ label: "Settings", href: "/settings" }, { label: "Push Tokens" }]}
							/>
						}
					/>
				</Route>
				<Route path="*" element={<Navigate to="/" replace />} />
			</Routes>
		</BrowserRouter>
	);
}
