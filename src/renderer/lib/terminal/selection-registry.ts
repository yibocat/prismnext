const selectionGetters = new Map<string, () => string>();

export const terminalSelectionRegistry = {
  register(tabId: string, getter: () => string): void {
    selectionGetters.set(tabId, getter);
  },
  unregister(tabId: string): void {
    selectionGetters.delete(tabId);
  },
  getSelection(tabId: string): string {
    return selectionGetters.get(tabId)?.() ?? "";
  },
};
