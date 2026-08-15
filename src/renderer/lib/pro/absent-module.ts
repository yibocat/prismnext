/**
 * Default `@prismnext/pro` resolve target for open-source / Free builds.
 * Official packaging may alias the package name to the private Pro entry.
 */
import type { ProModule } from "./host-api";

export const __PRISM_PRO_ABSENT = true as const;

export const hostApiVersion = 1 as const;

export async function register(_api: import("./host-api").ProHostAPI): Promise<void> {
  // No-op: Free build has no private Pro module.
}

const absent: ProModule = {
  hostApiVersion: 1,
  register,
};

export default absent;
