/**
 * Pre-register material-icon-theme icons for offline use.
 *
 * Without this, the `<Icon>` component (from `@iconify/react` default module)
 * fetches each icon from https://api.iconify.design at runtime — which is
 * blocked by the Content-Security-Policy (csp.ts).  Switching to the offline
 * import (`@iconify/react/offline`) removes the network dependency, and this
 * module seeds the in-memory icon store with the full bundled icon set so
 * every icon resolves instantly without any fetch.
 *
 * Import this ONCE before any component renders (main.tsx).
 */

import { addCollection } from "@iconify/react/offline";
import { icons } from "@iconify-json/material-icon-theme";

addCollection(icons);
