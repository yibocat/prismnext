import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Drop keyboard focus so closing overlays with Esc does not leave a
 * :focus-visible ring on whatever the browser falls back to (e.g. session row).
 */
/** Write text to the clipboard; falls back when `navigator.clipboard` is blocked. */
export async function writeClipboardText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const el = document.createElement("textarea");
      el.value = text;
      el.setAttribute("readonly", "");
      el.style.position = "fixed";
      el.style.left = "-9999px";
      document.body.appendChild(el);
      el.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(el);
      return ok;
    } catch {
      return false;
    }
  }
}

export function blurKeyboardFocus(): void {
  const active = document.activeElement;
  if (active instanceof HTMLElement && active !== document.body) {
    active.blur();
  }
  // Panel unmount may restore focus on the next frame — clear that too.
  requestAnimationFrame(() => {
    const next = document.activeElement;
    if (next instanceof HTMLElement && next !== document.body) {
      next.blur();
    }
  });
}
