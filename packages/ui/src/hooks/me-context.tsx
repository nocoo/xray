import { createContext, type ReactNode, useContext } from "react";
import type { MeUser } from "@/api/me";

const MeContext = createContext<MeUser | null>(null);

export function MeProvider({ user, children }: { user: MeUser; children: ReactNode }) {
	return <MeContext.Provider value={user}>{children}</MeContext.Provider>;
}

export function useAuthUser(): MeUser {
	const user = useContext(MeContext);
	if (!user) {
		throw new Error("useAuthUser requires MeProvider");
	}
	return user;
}

export function useAuthUserOptional(): MeUser | null {
	return useContext(MeContext);
}
