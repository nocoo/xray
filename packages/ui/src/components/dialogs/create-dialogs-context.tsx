import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from "react";
import { AddMemberDialog, type AddMemberTarget } from "@/components/dialogs/add-member-dialog";
import { CreateGroupDialog } from "@/components/dialogs/create-group-dialog";
import { CreateWatchlistDialog } from "@/components/dialogs/create-watchlist-dialog";

type CreateDialogsApi = {
	openCreateWatchlist: () => void;
	openCreateGroup: () => void;
	openAddMember: (target: AddMemberTarget, opts?: { onAdded?: () => void }) => void;
	/** Bump when lists change so sidebar can refresh. */
	listVersion: number;
	notifyListsChanged: () => void;
};

const CreateDialogsContext = createContext<CreateDialogsApi | null>(null);

export function CreateDialogsProvider({ children }: { children: ReactNode }) {
	const [listVersion, setListVersion] = useState(0);
	const notifyListsChanged = useCallback(() => setListVersion((v) => v + 1), []);

	const [watchlistOpen, setWatchlistOpen] = useState(false);
	const [groupOpen, setGroupOpen] = useState(false);

	const [memberOpen, setMemberOpen] = useState(false);
	const [memberTarget, setMemberTarget] = useState<AddMemberTarget | null>(null);
	const [memberCb, setMemberCb] = useState<(() => void) | undefined>();

	const openCreateWatchlist = useCallback(() => setWatchlistOpen(true), []);
	const openCreateGroup = useCallback(() => setGroupOpen(true), []);
	const openAddMember = useCallback((target: AddMemberTarget, opts?: { onAdded?: () => void }) => {
		setMemberTarget(target);
		setMemberCb(() => opts?.onAdded);
		setMemberOpen(true);
	}, []);

	const api = useMemo<CreateDialogsApi>(
		() => ({
			openCreateWatchlist,
			openCreateGroup,
			openAddMember,
			listVersion,
			notifyListsChanged,
		}),
		[openCreateWatchlist, openCreateGroup, openAddMember, listVersion, notifyListsChanged],
	);

	return (
		<CreateDialogsContext.Provider value={api}>
			{children}
			<CreateWatchlistDialog
				open={watchlistOpen}
				onOpenChange={setWatchlistOpen}
				onCreated={notifyListsChanged}
			/>
			<CreateGroupDialog
				open={groupOpen}
				onOpenChange={setGroupOpen}
				onCreated={notifyListsChanged}
			/>
			<AddMemberDialog
				open={memberOpen}
				onOpenChange={(o) => {
					setMemberOpen(o);
					if (!o) setMemberTarget(null);
				}}
				target={memberTarget}
				onAdded={() => {
					memberCb?.();
					notifyListsChanged();
				}}
			/>
		</CreateDialogsContext.Provider>
	);
}

export function useCreateDialogs(): CreateDialogsApi {
	const ctx = useContext(CreateDialogsContext);
	if (!ctx) throw new Error("useCreateDialogs requires CreateDialogsProvider");
	return ctx;
}
