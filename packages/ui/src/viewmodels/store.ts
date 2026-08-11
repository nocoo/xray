export type Listener = () => void;

export type Store<T> = {
	getState: () => T;
	setState: (partial: Partial<T> | ((s: T) => Partial<T>)) => void;
	subscribe: (listener: Listener) => () => void;
};

export function createStore<T extends object>(initial: T): Store<T> {
	let state = initial;
	const listeners = new Set<Listener>();
	return {
		getState: () => state,
		setState: (partial) => {
			const next = typeof partial === "function" ? partial(state) : partial;
			state = { ...state, ...next };
			for (const l of listeners) l();
		},
		subscribe: (listener) => {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
	};
}

export function errMsg(e: unknown): string {
	return e instanceof Error ? e.message : String(e);
}
