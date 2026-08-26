import type { AgentEventSink } from "../../shared/remote";

export interface ElectronSinkTarget {
  send(channel: string, payload: unknown): void;
  isDestroyed?: () => boolean;
}

export function createElectronSink(target: ElectronSinkTarget): AgentEventSink {
  return {
    emit(channel, payload) {
      if (target.isDestroyed?.()) return;
      target.send(channel, payload);
    },
  };
}
