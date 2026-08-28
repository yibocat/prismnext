/**
 * Connect constitution: every gate must leave a pass/fail record.
 * `HostDoctorReport` is what `prismnext-host doctor` / `host.doctor` returns.
 */

import type { HostRuntimeInventory } from "./host-runtime-env";

export const REMOTE_CONNECT_GATES = [
  "payload",
  "ssh",
  "host_key",
  "home",
  "bootstrap",
  "runtime",
  "host_serve",
  "handshake",
  "model",
  "doctor",
] as const;

export type RemoteConnectGate = (typeof REMOTE_CONNECT_GATES)[number];

export type RemoteLogLevel = "ok" | "info" | "warn" | "error";

export interface RemoteConnectGateResult {
  gate: RemoteConnectGate;
  ok: boolean;
  detail: string;
}

export interface HostDoctorReport {
  ok: boolean;
  /** `process.version` when Host is running; empty when Node is missing. */
  node: string;
  home: string;
  homeWritable: boolean;
  git: boolean;
  /** Payload Node / Git / Tectonic / Typst. Optional so older Hosts still pass `isHostDoctorReport`. */
  runtime?: HostRuntimeInventory;
}

export interface RemoteConnectConstitution {
  gates: RemoteConnectGateResult[];
  doctor: HostDoctorReport | null;
}

export function emptyConnectConstitution(): RemoteConnectConstitution {
  return { gates: [], doctor: null };
}

export function recordConnectGate(
  constitution: RemoteConnectConstitution,
  result: RemoteConnectGateResult,
): RemoteConnectConstitution {
  return {
    ...constitution,
    gates: [...constitution.gates.filter((item) => item.gate !== result.gate), result],
  };
}

export function lastFailedConnectGate(
  constitution: RemoteConnectConstitution,
): RemoteConnectGateResult | undefined {
  for (let i = constitution.gates.length - 1; i >= 0; i -= 1) {
    const item = constitution.gates[i];
    if (item && !item.ok) return item;
  }
  return undefined;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function isHostDoctorReport(value: unknown): value is HostDoctorReport {
  const rec = asRecord(value);
  if (!rec) return false;
  return (
    typeof rec.ok === "boolean"
    && typeof rec.node === "string"
    && typeof rec.home === "string"
    && typeof rec.homeWritable === "boolean"
    && typeof rec.git === "boolean"
  );
}

export function isRemoteConnectGate(value: unknown): value is RemoteConnectGate {
  return typeof value === "string" && (REMOTE_CONNECT_GATES as readonly string[]).includes(value);
}
