import { createContext, type ReactNode, useContext, useEffect, useState } from "react";
import * as api from "@/api/channels";
import { type ChannelsVm, createChannelsVm } from "@/viewmodels/channels-vm";

const Context = createContext<ChannelsVm | null>(null);
export function ChannelsProvider({ children }: { children: ReactNode }) {
	const [vm] = useState(() => createChannelsVm(api));
	useEffect(() => {
		void vm.loadChannels();
	}, [vm]);
	return <Context.Provider value={vm}>{children}</Context.Provider>;
}
export function useChannels() {
	const vm = useContext(Context);
	if (!vm) throw new Error("ChannelsProvider is required");
	return vm;
}
