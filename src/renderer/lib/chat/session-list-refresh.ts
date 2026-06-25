/** Notify the session list sidebar to reload from SQLite. */
export function requestSessionListRefresh(): void {
  window.dispatchEvent(new CustomEvent("prism:session-list-refresh"));
}
