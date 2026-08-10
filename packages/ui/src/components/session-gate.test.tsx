import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { SessionGate } from "./session-gate";

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe("SessionGate", () => {
	test("shows loading then children when authenticated", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(
				async () =>
					new Response(
						JSON.stringify({
							authenticated: true,
							user: { id: "1", email: "dev@xray.local", name: "Dev", image: null },
						}),
						{ status: 200 },
					),
			),
		);
		render(
			<SessionGate>
				<div>secured</div>
			</SessionGate>,
		);
		expect(screen.getByText(/Loading session/i)).toBeTruthy();
		await waitFor(() => {
			expect(screen.getByText("secured")).toBeTruthy();
		});
	});

	test("shows sign-in required on 401", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => new Response(JSON.stringify({ error: "Missing" }), { status: 401 })),
		);
		render(
			<SessionGate>
				<div>secured</div>
			</SessionGate>,
		);
		await waitFor(() => {
			expect(screen.getByText(/Sign in required/i)).toBeTruthy();
		});
	});
});
