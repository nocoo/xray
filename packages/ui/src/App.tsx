import { BrowserRouter, Navigate, Outlet, Route, Routes } from "react-router";
import { AppProviders } from "@/components/app-providers";
import { ChannelsProvider } from "@/components/channels-context";
import { CreateDialogsProvider } from "@/components/dialogs/create-dialogs-context";
import { AppShell } from "@/components/layout";
import { SessionGate } from "@/components/session-gate";
import { ChannelSettingsPage } from "@/views/channel-settings-page";
import { ChannelsManagePage } from "@/views/channels-manage-page";
import { ChannelsPage } from "@/views/channels-page";
import { DashboardPage } from "@/views/dashboard-page";
import { GroupsPage } from "@/views/groups-page";
import { IntegrationsZhetoPage } from "@/views/integrations-zheto-page";
import { SettingsPage } from "@/views/settings-page";
import { TagsPage } from "@/views/tags-page";
import { WatchlistDetailPage } from "@/views/watchlist-detail-page";
import { WatchlistsPage } from "@/views/watchlists-page";

function ShellLayout() {
	return (
		<SessionGate>
			<ChannelsProvider>
				<CreateDialogsProvider>
					<AppShell>
						<Outlet />
					</AppShell>
				</CreateDialogsProvider>
			</ChannelsProvider>
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
						<Route path="/channels" element={<ChannelsManagePage />} />
						<Route path="/channels/:channelId/settings" element={<ChannelSettingsPage />} />
						<Route path="/channels/:channelId" element={<ChannelsPage />} />
						<Route path="/channels/:channelId/articles/:articleId" element={<ChannelsPage />} />
						<Route path="/groups" element={<GroupsPage />} />
						<Route path="/integrations/zheto" element={<IntegrationsZhetoPage />} />
						<Route path="/tags" element={<TagsPage />} />
						<Route path="/settings" element={<SettingsPage />} />
					</Route>
					<Route path="*" element={<Navigate to="/" replace />} />
				</Routes>
			</BrowserRouter>
		</AppProviders>
	);
}
