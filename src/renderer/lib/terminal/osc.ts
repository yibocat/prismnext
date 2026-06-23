/** Parse OSC 133 shell-integration markers from PTY output. */
export type Osc133Event = "commandStart" | "commandEnd" | "promptStart";

const OSC_133_RE = /\x1b\]133;([^\x07\x1b]+)(?:\x07|\x1b\\)/g;

export function parseOsc133Events(data: string): Osc133Event[] {
  const events: Osc133Event[] = [];
  OSC_133_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = OSC_133_RE.exec(data)) !== null) {
    const payload = match[1];
    if (payload === "C" || payload.startsWith("C;")) {
      events.push("commandStart");
    } else if (payload.startsWith("D")) {
      events.push("commandEnd");
    } else if (payload === "A" || payload.startsWith("A;")) {
      events.push("promptStart");
    }
  }
  return events;
}

/** Apply OSC 133 events in order to derive the next busy flag. */
export function applyOsc133BusySequence(events: Osc133Event[], currentBusy: boolean): boolean {
  let busy = currentBusy;
  for (const event of events) {
    if (event === "commandStart") busy = true;
    if (event === "commandEnd" || event === "promptStart") busy = false;
  }
  return busy;
}

/** @deprecated Use applyOsc133BusySequence for ordered event handling. */
export function busyFromOsc133Events(events: Osc133Event[]): boolean | null {
  if (events.length === 0) return null;
  return applyOsc133BusySequence(events, false);
}
