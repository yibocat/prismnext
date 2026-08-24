import {
  normalizeSessionIconConfig,
  type SessionChromeEntry,
  type SessionIconConfig,
} from "@shared/chat/session-chrome";
import { useSettingsStore } from "@/stores/settings-store";
import { settingsDesktop } from "@/lib/desktop-api/settings";
import { resolveSessionIcon } from "@/lib/chat/session-icon-registry";

function chromeMapForProject(projectRoot: string): Record<string, SessionChromeEntry> {
  const map = useSettingsStore.getState().settings.sessionChromeByProject ?? {};
  return map[projectRoot] ?? {};
}

export function getSessionChromeEntry(
  projectRoot: string | null,
  sessionId: string,
): SessionChromeEntry | undefined {
  if (!projectRoot || !sessionId.trim()) return undefined;
  return chromeMapForProject(projectRoot)[sessionId];
}

export function isSessionUnread(projectRoot: string | null, sessionId: string): boolean {
  return getSessionChromeEntry(projectRoot, sessionId)?.unread === true;
}

let chromeWriteTail: Promise<void> = Promise.resolve();

async function persistSessionChrome(
  projectRoot: string,
  sessionId: string,
  patch: Partial<SessionChromeEntry> | null,
): Promise<void> {
  const settings = useSettingsStore.getState().settings;
  const rootMap = { ...(settings.sessionChromeByProject ?? {}) };
  const sessionMap = { ...(rootMap[projectRoot] ?? {}) };

  if (patch === null) {
    delete sessionMap[sessionId];
  } else {
    const prev = sessionMap[sessionId] ?? {};
    const next = { ...prev, ...patch };
    if (next.icon === null) delete next.icon;
    if (next.unread === false) delete next.unread;
    const hasKeys = Object.keys(next).length > 0;
    if (hasKeys) {
      sessionMap[sessionId] = next;
    } else {
      delete sessionMap[sessionId];
    }
  }

  if (Object.keys(sessionMap).length === 0) {
    delete rootMap[projectRoot];
  } else {
    rootMap[projectRoot] = sessionMap;
  }

  useSettingsStore.setState((s) => ({
    settings: { ...s.settings, sessionChromeByProject: rootMap },
  }));
  const write = () => {
    const latest = useSettingsStore.getState().settings.sessionChromeByProject;
    return settingsDesktop.settingsSet({ sessionChromeByProject: latest });
  };
  chromeWriteTail = chromeWriteTail.then(write, write);
  await chromeWriteTail;
}

export async function setSessionUnread(
  projectRoot: string,
  sessionId: string,
  unread: boolean,
): Promise<void> {
  if (!unread) {
    await persistSessionChrome(projectRoot, sessionId, { unread: false });
    return;
  }
  await persistSessionChrome(projectRoot, sessionId, { unread: true });
}

export async function markSessionRead(projectRoot: string, sessionId: string): Promise<void> {
  await setSessionUnread(projectRoot, sessionId, false);
}

/**
 * Agent / terminal just finished. Skip if the user is on this session;
 * if they focus it while we persist, clear again so loadSession wins.
 */
export async function markSessionAutoUnreadIfBackground(
  projectRoot: string | null,
  sessionId: string,
  isActive: () => boolean,
): Promise<void> {
  if (!projectRoot || !sessionId.trim()) return;
  if (isActive()) return;
  await setSessionUnread(projectRoot, sessionId, true);
  if (isActive()) {
    await markSessionRead(projectRoot, sessionId);
  }
}

export async function setSessionIcon(
  projectRoot: string,
  sessionId: string,
  icon: SessionIconConfig | null,
): Promise<void> {
  const normalized = normalizeSessionIconConfig(icon);
  if (!normalized || !resolveSessionIcon(normalized)) {
    await persistSessionChrome(projectRoot, sessionId, { icon: null });
    return;
  }
  const next: SessionIconConfig = { kind: normalized.kind, value: normalized.value };
  if (normalized.kind === "lucide" && normalized.color) next.color = normalized.color;
  await persistSessionChrome(projectRoot, sessionId, { icon: next });
}

export async function clearSessionChromeEntry(
  projectRoot: string,
  sessionId: string,
): Promise<void> {
  await persistSessionChrome(projectRoot, sessionId, null);
}
