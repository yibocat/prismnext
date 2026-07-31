import { useComposerEditorStore } from "@/stores/composer-editor-store";
import { useLayoutStore } from "@/stores/layout-store";

export const MODEL_PICKER_EVENT = "prism:model-picker";

/** @deprecated Use MODEL_PICKER_EVENT */
export const OPEN_MODEL_PICKER_EVENT = MODEL_PICKER_EVENT;

export type ModelPickerEventDetail = { mode: "open" | "close" };

/** Synced by ModelThoughtSelect — used so ⌥K can toggle without remount races. */
let modelPickerOpen = false;

export function isModelPickerOpen(): boolean {
  return modelPickerOpen;
}

export function setModelPickerOpenState(open: boolean): void {
  modelPickerOpen = open;
}

function fireModelPicker(mode: ModelPickerEventDetail["mode"]): void {
  window.dispatchEvent(
    new CustomEvent<ModelPickerEventDetail>(MODEL_PICKER_EVENT, { detail: { mode } }),
  );
}

function ensureComposerReady(): void {
  const layout = useLayoutStore.getState();
  if (layout.editorMaximized) {
    layout.requestAiBarComposerFocus();
  } else {
    layout.setLeftSidebarView("sessions");
    layout.requestCenterExpand();
    useComposerEditorStore.getState().handle?.focus();
  }
}

/** Wake the composer (panel or AiBar), then open the model picker. */
export function requestOpenModelPicker(): void {
  ensureComposerReady();
  const fire = () => fireModelPicker("open");
  // AiBar idle → input remounts the picker; retry a couple frames.
  fire();
  requestAnimationFrame(() => {
    fire();
    requestAnimationFrame(fire);
  });
}

/** ⌥K / Alt+K: open if closed, close if open. */
export function requestToggleModelPicker(): void {
  if (modelPickerOpen) {
    fireModelPicker("close");
    return;
  }
  requestOpenModelPicker();
}
