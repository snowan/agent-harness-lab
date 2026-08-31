import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { labCommands, labStore } from "./app/runtime";
import "./styles.css";
import { createWebMcpExecutor } from "./webmcp/execute";
import { registerWebMcpTools } from "./webmcp/register";
import { webMcpRuntime } from "./webmcp/status";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Agent Harness Lab could not find the #root application mount.");
}

const webMcpExecutor = createWebMcpExecutor({
  store: labStore,
  commands: labCommands,
  runtime: webMcpRuntime,
});
const webMcpRegistration = registerWebMcpTools({
  document,
  executor: webMcpExecutor,
  runtime: webMcpRuntime,
});
void webMcpRegistration.ready;

function stopWebMcpRegistration(): void {
  webMcpRegistration.abort();
}

window.addEventListener("pagehide", stopWebMcpRegistration, { once: true });

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    window.removeEventListener("pagehide", stopWebMcpRegistration);
    stopWebMcpRegistration();
  });
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
