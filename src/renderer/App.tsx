import { useEffect, useState } from "react";

declare global {
  interface Window {
    electronAPI?: { ping: () => Promise<string> };
  }
}

export function App() {
  const [ping, setPing] = useState("");

  useEffect(() => {
    window.electronAPI?.ping().then(setPing);
  }, []);

  return (
    <div style={{ padding: 40, fontFamily: "system-ui" }}>
      <h1>Prism Next</h1>
      <p>AI-Powered LaTeX Writing Workspace</p>
      {ping && <p style={{ color: "green" }}>IPC: {ping}</p>}
    </div>
  );
}
