import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./index.css";

const root = document.getElementById("root");
if (!root) {
	throw new Error("Root element not found");
}

let stored: string | null = null;
try {
	stored = window.localStorage.getItem("theme");
} catch {
	// Continue with the system theme when browser storage is denied.
}
const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
const isDark = stored === "dark" || (stored !== "light" && prefersDark);
document.documentElement.classList.toggle("dark", isDark);
document.documentElement.classList.toggle("light", !isDark);
document.documentElement.dataset.mode = isDark ? "dark" : "light";

createRoot(root).render(
	<StrictMode>
		<App />
	</StrictMode>,
);
