import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./index.css";

const root = document.getElementById("root");
if (!root) {
	throw new Error("Root element not found");
}

// Apply stored theme before paint
const stored = localStorage.getItem("theme");
const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
const dark = stored === "dark" || ((stored === "system" || !stored) && prefersDark);
document.documentElement.classList.toggle("dark", dark);

createRoot(root).render(
	<StrictMode>
		<App />
	</StrictMode>,
);
