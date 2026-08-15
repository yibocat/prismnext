export {
  SETTINGS_CARD,
  SETTINGS_ROW,
  SETTINGS_ROW_DESC,
  SETTINGS_ROW_LABEL,
  SETTINGS_TRIGGER,
} from "./settings-tokens";

/**
 * @deprecated Job Monitor settings now live in `terminal-settings.tsx`.
 * Kept so existing settings token re-exports do not break.
 */
export function AiTerminalSettingsFields(): null {
  return null;
}
