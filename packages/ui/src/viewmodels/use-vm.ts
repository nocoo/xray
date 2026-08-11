import { useSyncExternalStore } from "react";

type Subscribable<T> = {
	subscribe: (onStoreChange: () => void) => () => void;
	getState: () => T;
};

/** Bind a non-DOM ViewModel store to React without putting orchestration in the View. */
export function useVm<T>(vm: Subscribable<T>): T {
	return useSyncExternalStore(vm.subscribe, vm.getState, vm.getState);
}
