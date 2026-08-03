import type { InlineTokenVariant } from "@/components/modules/chat/inline-tokens/variants";
import { codeSnippetLabel } from "@/lib/chat/context-insert";
import { gitDiffSnippetLabel } from "@/lib/git/diff-hunk-snippet";
import type { ComposerDragPayload } from "./composer-drag";

export interface ComposerDragGhostMeta {
  variant: InlineTokenVariant;
  primary: string;
  secondary?: string;
  prefix?: "@" | "/";
}

const VARIANT_ACCENT_LIGHT: Record<InlineTokenVariant, { text: string; border: string; bg: string }> = {
  file: { text: "#075985", border: "#7dd3fc", bg: "#f0f9ff" },
  literature: { text: "#312e81", border: "#a5b4fc", bg: "#eef2ff" },
  link: { text: "#065f46", border: "#6ee7b7", bg: "#ecfdf5" },
  profile: { text: "#5b21b6", border: "#c4b5fd", bg: "#f5f3ff" },
  command: { text: "#78350f", border: "#fcd34d", bg: "#fffbeb" },
  "command-action": { text: "#7c2d12", border: "#fdba74", bg: "#fff7ed" },
  skill: { text: "#86198f", border: "#e879f9", bg: "#fdf4ff" },
  mcp: { text: "#155e75", border: "#67e8f9", bg: "#ecfeff" },
  terminal: { text: "#44403c", border: "#d6d3d1", bg: "#fafaf9" },
  code: { text: "#064e3b", border: "#6ee7b7", bg: "#ecfdf5" },
  "code-git": { text: "#134e4a", border: "#5eead4", bg: "#f0fdfa" },
  "git-diff": { text: "#881337", border: "#fda4af", bg: "#fff1f2" },
};

/** Dark palette — opaque fills aligned with inline-tokens `dark:` text hues. */
const VARIANT_ACCENT_DARK: Record<InlineTokenVariant, { text: string; border: string; bg: string }> = {
  file: { text: "#7dd3fc", border: "#0369a1", bg: "#0c4a6e" },
  literature: { text: "#a5b4fc", border: "#4338ca", bg: "#1e1b4b" },
  link: { text: "#6ee7b7", border: "#047857", bg: "#064e3b" },
  profile: { text: "#c4b5fd", border: "#6d28d9", bg: "#3b0764" },
  command: { text: "#fcd34d", border: "#b45309", bg: "#451a03" },
  "command-action": { text: "#fdba74", border: "#c2410c", bg: "#431407" },
  skill: { text: "#e879f9", border: "#a21caf", bg: "#4a044e" },
  mcp: { text: "#67e8f9", border: "#0e7490", bg: "#164e63" },
  terminal: { text: "#d6d3d1", border: "#57534e", bg: "#292524" },
  code: { text: "#6ee7b7", border: "#047857", bg: "#064e3b" },
  "code-git": { text: "#5eead4", border: "#0f766e", bg: "#134e4a" },
  "git-diff": { text: "#fda4af", border: "#be123c", bg: "#4c0519" },
};

function isDarkComposerChrome(): boolean {
  if (typeof document === "undefined") return false;
  return document.documentElement.classList.contains("dark");
}

function variantAccent(variant: InlineTokenVariant) {
  return isDarkComposerChrome() ? VARIANT_ACCENT_DARK[variant] : VARIANT_ACCENT_LIGHT[variant];
}

function truncate(text: string, max: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

export function composerDragGhostMeta(payload: ComposerDragPayload): ComposerDragGhostMeta {
  switch (payload.kind) {
    case "file-mention":
      return { variant: "file", primary: payload.label, prefix: "@" };
    case "paper-mention":
      return {
        variant: "literature",
        primary: payload.label ?? payload.bibkey,
        prefix: "@",
      };
    case "paper-snippet":
      return {
        variant: "literature",
        primary: `${payload.bibkey}:p${payload.page}`,
        secondary: truncate(payload.quotedText, 56),
        prefix: "@",
      };
    case "experiment-mention":
      return { variant: "literature", primary: payload.label, prefix: "@" };
    case "experiment-run":
      return {
        variant: "terminal",
        primary: payload.runId,
        secondary: truncate(payload.command, 48),
        prefix: "@",
      };
    case "link":
      return {
        variant: "link",
        primary: payload.label ?? payload.url,
        secondary: payload.label ? payload.url : undefined,
      };
    case "code-snippet":
      return {
        variant: payload.source === "git-diff" ? "code-git" : "code",
        primary: codeSnippetLabel(payload),
        secondary: truncate(payload.text, 56),
      };
    case "git-diff":
      return {
        variant: "git-diff",
        primary: gitDiffSnippetLabel(payload.filePath, payload.hunks),
        secondary: `+${payload.addedLineCount} / -${payload.removedLineCount}`,
      };
  }
}

export function composerDragGhostMetaForPayloads(payloads: ComposerDragPayload[]): ComposerDragGhostMeta {
  if (payloads.length === 0) {
    return { variant: "file", primary: "" };
  }
  if (payloads.length === 1) {
    return composerDragGhostMeta(payloads[0]!);
  }
  const first = composerDragGhostMeta(payloads[0]!);
  return {
    ...first,
    primary: `${first.primary} +${payloads.length - 1}`,
    secondary: undefined,
  };
}

/** Off-screen chip used as HTML5 drag preview (matches inline token palette). */
export function mountComposerDragGhost(payloads: ComposerDragPayload[]): {
  element: HTMLElement;
  cleanup: () => void;
} {
  const meta = composerDragGhostMetaForPayloads(payloads);
  const accent = variantAccent(meta.variant);
  const dark = isDarkComposerChrome();

  const shell = document.createElement("div");
  shell.style.cssText = [
    "position:fixed",
    "top:-2000px",
    "left:-2000px",
    "z-index:99999",
    "pointer-events:none",
    "max-width:280px",
    "padding:6px 10px",
    "border-radius:8px",
    "border:1px solid",
    "font:500 13px/1.35 system-ui,-apple-system,sans-serif",
    dark ? "box-shadow:0 8px 24px rgba(0,0,0,0.45)" : "box-shadow:0 4px 16px rgba(0,0,0,0.12)",
    `color:${accent.text}`,
    `border-color:${accent.border}`,
    `background:${accent.bg}`,
  ].join(";");

  const row = document.createElement("div");
  row.style.cssText = "display:flex;align-items:center;gap:4px;min-width:0";

  if (meta.prefix) {
    const prefix = document.createElement("span");
    prefix.textContent = meta.prefix;
    prefix.style.opacity = "0.65";
    row.appendChild(prefix);
  }

  const primary = document.createElement("span");
  primary.textContent = meta.primary;
  primary.style.cssText = "overflow:hidden;text-overflow:ellipsis;white-space:nowrap";
  row.appendChild(primary);

  shell.appendChild(row);

  if (meta.secondary) {
    const secondary = document.createElement("div");
    secondary.textContent = meta.secondary;
    secondary.style.cssText = [
      "margin-top:4px",
      "font-size:11px",
      "line-height:1.35",
      "opacity:0.72",
      "overflow:hidden",
      "display:-webkit-box",
      "-webkit-line-clamp:2",
      "-webkit-box-orient:vertical",
    ].join(";");
    shell.appendChild(secondary);
  }

  document.body.appendChild(shell);
  return {
    element: shell,
    cleanup: () => {
      shell.remove();
    },
  };
}

export function applyComposerDragPreview(
  dataTransfer: DataTransfer,
  payloads: ComposerDragPayload[],
): void {
  if (payloads.length === 0) return;
  const { element, cleanup } = mountComposerDragGhost(payloads);
  const rect = element.getBoundingClientRect();
  dataTransfer.setDragImage(element, Math.min(rect.width / 2, 140), Math.min(rect.height / 2, 24));
  requestAnimationFrame(cleanup);
}
