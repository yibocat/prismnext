import React from "react";
import ReactDOM from "react-dom/client";
import { I18nextProvider } from "react-i18next";
import { App } from "./App";
// Pre-register material-icon-theme icons so @iconify/react/offline can resolve
// them without fetching from the CDN (blocked by CSP). Must be imported
// before any component that renders <Icon>.
import "./lib/iconify-setup";
import { desktopPlatform } from "./lib/desktop-api/shell";
import { initI18n } from "./lib/i18n";
import "./styles/globals.css";
import "./styles/tokens.css";
import "./styles/tokens/layout.css";
import "./styles/tokens/editor.css";
import "./styles/tokens/preview.css";
import "./styles/tokens/chat.css";
import "./styles/tokens/project.css";
import "./styles/tokens/shared.css";

const i18n = initI18n();

document.documentElement.dataset.platform = desktopPlatform();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <I18nextProvider i18n={i18n}>
      <App />
    </I18nextProvider>
  </React.StrictMode>,
);
