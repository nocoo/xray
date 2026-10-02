import { afterEach, expect, test, vi } from "vitest";
import { restoreReadingPosition } from "./reading-position";

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
	document.body.innerHTML = "";
	Reflect.deleteProperty(document, "fonts");
});

test("restores on image and font layout, but user scroll stops all delayed restore", async () => {
	let resized = () => {};
	const disconnect = vi.fn();
	vi.stubGlobal(
		"ResizeObserver",
		class {
			constructor(callback: () => void) {
				resized = callback;
			}
			observe() {}
			disconnect = disconnect;
		},
	);
	let ready!: () => void;
	Object.defineProperty(document, "fonts", {
		configurable: true,
		value: {
			ready: new Promise<void>((resolve) => {
				ready = resolve;
			}),
		},
	});
	const element = document.createElement("div");
	element.append(document.createElement("article"));
	document.body.append(element);
	const save = vi.fn();
	const stop = restoreReadingPosition(element, 600, save);
	expect(element.scrollTop).toBe(600);
	element.dispatchEvent(new Event("scroll"));
	expect(save).not.toHaveBeenCalled();
	element.scrollTop = 0;
	resized();
	expect(element.scrollTop).toBe(600);
	element.scrollTop = 0;
	element.dispatchEvent(new Event("load"));
	expect(element.scrollTop).toBe(600);
	element.scrollTop = 350;
	element.dispatchEvent(new Event("scroll"));
	expect(save).toHaveBeenCalledWith(350);
	ready();
	await Promise.resolve();
	resized();
	element.dispatchEvent(new Event("error"));
	expect(element.scrollTop).toBe(350);
	stop();
	expect(disconnect).toHaveBeenCalled();
});

test.each(["wheel", "touchstart", "pointerdown", "keydown"])(
	"%s intent cancels pending layout restores",
	async (intent) => {
		let resized = () => {};
		vi.stubGlobal(
			"ResizeObserver",
			class {
				constructor(callback: () => void) {
					resized = callback;
				}
				observe() {}
				disconnect() {}
			},
		);
		const element = document.createElement("div");
		const save = vi.fn();
		const stop = restoreReadingPosition(element, 400, save);
		element.dispatchEvent(new Event(intent));
		element.scrollTop = 200;
		resized();
		await Promise.resolve();
		expect(element.scrollTop).toBe(200);
		element.dispatchEvent(new Event("scroll"));
		expect(save).toHaveBeenCalledWith(200);
		stop();
		element.scrollTop = 100;
		element.dispatchEvent(new Event("scroll"));
		expect(save).toHaveBeenCalledTimes(1);
	},
);

test("document mode restores the window and observes article layout rather than a nested pane", async () => {
	let resized = () => {};
	const observe = vi.fn();
	const disconnect = vi.fn();
	vi.stubGlobal(
		"ResizeObserver",
		class {
			constructor(callback: () => void) {
				resized = callback;
			}
			observe = observe;
			disconnect = disconnect;
		},
	);
	let top = 0;
	vi.spyOn(window, "scrollY", "get").mockImplementation(() => top);
	const scrollTo = vi
		.spyOn(window, "scrollTo")
		.mockImplementation((options: number | ScrollToOptions) => {
			if (typeof options === "object") top = options.top ?? 0;
		});
	const element = document.createElement("section");
	const article = document.createElement("article");
	element.append(article);
	document.body.append(element);
	const save = vi.fn();
	const stop = restoreReadingPosition(element, 700, save, "document");
	expect(scrollTo).toHaveBeenCalledWith({ top: 700, behavior: "instant" });
	expect(element.scrollTop).toBe(0);
	expect(observe).toHaveBeenCalledWith(article);
	window.dispatchEvent(new Event("scroll"));
	expect(save).not.toHaveBeenCalled();
	top = 200;
	resized();
	expect(top).toBe(700);
	window.dispatchEvent(new Event("touchstart"));
	top = 950;
	window.dispatchEvent(new Event("scroll"));
	expect(save).toHaveBeenLastCalledWith(950);
	resized();
	expect(top).toBe(950);
	stop();
	window.dispatchEvent(new Event("scroll"));
	expect(save).toHaveBeenCalledOnce();
	expect(disconnect).toHaveBeenCalledOnce();
	await Promise.resolve();
});

test("ignores resize clamping from a retired scroll owner before its listener is detached", () => {
	let resized = () => {};
	vi.stubGlobal(
		"ResizeObserver",
		class {
			constructor(callback: () => void) {
				resized = callback;
			}
			observe() {}
			disconnect() {}
		},
	);
	const element = document.createElement("div");
	let current = true;
	const save = vi.fn();
	const stop = restoreReadingPosition(element, 600, save, "element", () => current);
	element.scrollTop = 650;
	element.dispatchEvent(new Event("scroll"));
	expect(save).toHaveBeenLastCalledWith(650);
	current = false;
	element.scrollTop = 0;
	element.dispatchEvent(new Event("scroll"));
	resized();
	expect(save).toHaveBeenCalledOnce();
	expect(element.scrollTop).toBe(0);
	stop();
});
