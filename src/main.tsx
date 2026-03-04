import { createRoot } from "react-dom/client";
import App from "./App";

// Prevent context menu and default touch scroll on mobile
document.addEventListener("contextmenu", (e) => e.preventDefault());
document.addEventListener("touchmove", (e) => e.preventDefault(), { passive: false });

createRoot(document.getElementById("root")!).render(<App />);
