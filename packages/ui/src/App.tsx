import { BrowserRouter, Navigate, Outlet, Route, Routes } from "react-router";
import { AppProviders } from "@/components/app-providers";
import { CreateDialogsProvider } from "@/components/dialogs/create-dialogs-context";
import { AppShell } from "@/components/layout";
import { SessionGate } from "@/components/session-gate";
import { DashboardPage } from "@/views/dashboard-page";
import { GroupsPage } from "@/views/groups-page";
import { IntegrationsZhetoPage } from "@/views/integrations-zheto-page";
import { SettingsPage } from "@/views/settings-page";
import { WatchlistDetailPage } from "@/views/watchlist-detail-page";
import { WatchlistsPage } from "@/views/watchlists-page";

function ShellLayout() {
	return (
		<SessionGate>
			<CreateDialogsProvider>
				<AppShell>
					<Outlet />
				</AppShell>
			</CreateDialogsProvider>
		</SessionGate>
	);
}

export function App() {
	return (
		<AppProviders>
			<BrowserRouter>
				<Routes>
					<Route element={<ShellLayout />}>
						<Route path="/" element={<DashboardPage />} />
						<Route path="/watchlist" element={<WatchlistsPage />} />
						<Route path="/watchlist/:id" element={<WatchlistDetailPage />} />
						<Route path="/groups" element={<GroupsPage />} />
						<Route path="/integrations/zheto" element={<IntegrationsZhetoPage />} />
						<Route path="/settings" element={<SettingsPage />} />
					</Route>
					<Route path="*" element={<Navigate to="/" replace />} />
				</Routes>
			</BrowserRouter>
		</AppProviders>
	);
}
