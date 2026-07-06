import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
// Pre-register material-icon-theme icons so @iconify/react/offline can resolve
// them without fetching from the CDN (blocked by CSP). Must be imported
// before any component that renders <Icon>.
import "./lib/iconify-setup";
import "./styles/globals.css";
import "./styles/tokens.css";
import "./styles/tokens/layout.css";
import "./styles/tokens/editor.css";
import "./styles/tokens/preview.css";
import "./styles/tokens/chat.css";
import "./styles/tokens/project.css";
import "./styles/tokens/shared.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
