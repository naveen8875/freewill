import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import { AppErrorBoundary } from "./app/AppErrorBoundary";
import "./styles/global.css";

const marketPackUrl = "/little-worlds/lw-market.js?v=20261025";

function renderApp() {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <AppErrorBoundary><App /></AppErrorBoundary>
    </StrictMode>,
  );
}

function loadMarketPack() {
  if (window.LW.PRESETS.some((preset) => preset.id === "copperfield")) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = marketPackUrl;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("The economy asset pack did not load."));
    document.head.append(script);
  });
}

if (window.location.pathname.startsWith("/observatory")) {
  renderApp();
} else {
  void loadMarketPack().catch((cause) => console.error(cause)).finally(renderApp);
}
