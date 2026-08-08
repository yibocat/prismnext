declare module "@prismnext/pro" {
  import type { ProHostAPI, ProModule } from "./host-api";

  export const hostApiVersion: 1;
  export const __PRISM_PRO_ABSENT: true | undefined;
  export function register(api: ProHostAPI): void | Promise<void>;
  const mod: ProModule & { __PRISM_PRO_ABSENT?: true };
  export default mod;
}
