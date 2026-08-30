import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Agent Harness Lab could not find the #root application mount.");
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
