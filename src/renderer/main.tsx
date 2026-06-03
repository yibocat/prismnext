import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import "./styles/globals.css";
import "./styles/tokens.css";
import "./styles/tokens/layout.css";
import "./styles/tokens/editor.css";
import "./styles/tokens/preview.css";
import "./styles/tokens/chat.css";
import "./styles/tokens/project.css";
import "./styles/tokens/shared.css";
import "./styles/themes/academic-blue.css";
import "./styles/themes/ink-green.css";
import "./styles/themes/rose.css";
import "./styles/themes/violet.css";
import "./styles/themes/amber.css";
import "./styles/themes/mono.css";
import "./styles/themes/teal.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
