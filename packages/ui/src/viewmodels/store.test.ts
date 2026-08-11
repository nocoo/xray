import { describe, expect, test, vi } from "vitest";
import { createStore, errMsg } from "./store";

describe("createStore", () => {
	test("setState merges and notifies", () => {
		const store = createStore({ a: 1, b: "x" });
		const spy = vi.fn();
		const unsub = store.subscribe(spy);
		store.setState({ a: 2 });
		expect(store.getState()).toEqual({ a: 2, b: "x" });
		expect(spy).toHaveBeenCalledOnce();
		store.setState((s) => ({ b: `${s.b}y` }));
		expect(store.getState().b).toBe("xy");
		unsub();
		store.setState({ a: 3 });
		expect(spy).toHaveBeenCalledTimes(2);
	});

	test("errMsg", () => {
		expect(errMsg(new Error("e"))).toBe("e");
		expect(errMsg("s")).toBe("s");
	});
});
