import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { hasUnsavedDrafts, preventDraftUnload } from "@/lib/unsaved-drafts";
import { useUnsavedDraft } from "./use-unsaved-draft";

afterEach(cleanup);
function unloading() {
	const event = new Event("beforeunload", { cancelable: true });
	window.dispatchEvent(event);
	return event.defaultPrevented;
}
test("registers only unsaved edits, preserves other forms, cleans up saved/cancelled/unmounted drafts", () => {
	const first = renderHook(({ dirty }) => useUnsavedDraft(dirty), {
		initialProps: { dirty: false },
	});
	expect(hasUnsavedDrafts()).toBe(false);
	expect(unloading()).toBe(false);
	first.rerender({ dirty: true });
	expect(hasUnsavedDrafts()).toBe(true);
	expect(unloading()).toBe(true);
	const second = renderHook(() => useUnsavedDraft(true));
	first.rerender({ dirty: false });
	expect(hasUnsavedDrafts()).toBe(true);
	expect(unloading()).toBe(true);
	second.unmount();
	expect(hasUnsavedDrafts()).toBe(false);
	expect(unloading()).toBe(false);
	const event = new Event("beforeunload", { cancelable: true });
	preventDraftUnload(event as BeforeUnloadEvent);
	expect(event.defaultPrevented).toBe(false);
});
