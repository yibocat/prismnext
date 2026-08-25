import type { RemoteConnectConstitution, RemoteConnectGate, RemoteLogLevel } from "./doctor";
import type { HostHandshake } from "./protocol";
import type { RemoteErrorCode } from "./errors";

export interface RemoteConnectResult {
  ok: boolean;
  profileId: string;
  connectionId?: string;
  handshake?: HostHandshake;
  code?: RemoteErrorCode;
  message?: string;
  hostKey?: RemoteHostKeyPrompt;
  constitution?: RemoteConnectConstitution;
}

export interface RemoteHostKeyPrompt {
  host: string;
  port: number;
  fingerprint: string;
}

export type RemoteConnectionState =
  | { phase: "idle" }
  | { phase: "connecting"; profileId: string }
  | { phase: "awaiting_host_key"; profileId: string; hostKey: RemoteHostKeyPrompt }
  | { phase: "bootstrapping"; profileId: string; connectionId: string }
  | {
    phase: "ready";
    profileId: string;
    connectionId: string;
    handshake: HostHandshake;
    constitution?: RemoteConnectConstitution;
  }
  | {
    phase: "error";
    profileId: string;
    code: RemoteErrorCode;
    message: string;
    constitution?: RemoteConnectConstitution;
  }
  | { phase: "disconnected"; profileId: string };

export interface RemoteBootstrapLogLine {
  ts: number;
  profileId: string;
  message: string;
  level?: RemoteLogLevel;
  gate?: RemoteConnectGate;
}

export interface RemoteConnectionSnapshot {
  byProfileId: Record<string, RemoteConnectionState>;
  logs: RemoteBootstrapLogLine[];
}

export function idleRemoteConnection(): RemoteConnectionState {
  return { phase: "idle" };
}
