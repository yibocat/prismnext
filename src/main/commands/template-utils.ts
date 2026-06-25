/** Legacy: strip shell-capture prefix when opening old command files in Settings. */
export function promptTemplateForEdit(template: string): string {
  const trimmed = template.trim();
  const legacyShell = trimmed.match(/^!\`([^`]+)`(?:\s*\n+([\s\S]*))?$/);
  if (legacyShell) return (legacyShell[2] ?? "").trim();
  return trimmed;
}

export function isValidCommandName(name: string): boolean {
  return /^[a-z0-9][a-z0-9-]*$/.test(name);
}
