import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { createLogger } from "../services/logger";
import {
  buildOpenCodeGoEffortPatch,
  mergeOpenCodeGoEffortIntoConfig,
} from "../../shared/opencode-go-effort-variants";

const log = createLogger("opencode-go-effort", "agent");

export function readModelsDevGoSection(modelsJsonPath: string): unknown {
  if (!existsSync(modelsJsonPath)) return undefined;
  try {
    const raw = JSON.parse(readFileSync(modelsJsonPath, "utf8")) as Record<
      string,
      unknown
    >;
    return raw["opencode-go"];
  } catch {
    return undefined;
  }
}

/**
 * Inject catalog model variants derived from models.dev `reasoning_options`.
 * Required on OpenCode ≤1.17.x (ACP validates effort against `model.variants` only).
 * Skipped on ≥1.18.0 where `reasoningVariants()` builds variants from catalog.
 *
 * RELEASE TODO (0.6.7+): delete this module + `opencode-go-effort-variants.ts` merge path
 * once bundled OpenCode is permanently ≥1.18 (see changelog 0.6.6 Tech debt).
 */
export function syncOpenCodeGoEffortVariants(
  configPaths: string[],
  modelsJsonPath: string,
  opts?: { enabled?: boolean },
): boolean {
  if (opts?.enabled === false) {
    log.debug("Skipping opencode-go effort variant config sync (OpenCode ≥1.18)");
    return false;
  }
  const goSection = readModelsDevGoSection(modelsJsonPath);
  const patch = buildOpenCodeGoEffortPatch(goSection);
  if (Object.keys(patch).length === 0) {
    log.debug("No opencode-go effort patch from models.json");
    return false;
  }

  let anyChanged = false;
  for (const configPath of configPaths) {
    let config: Record<string, unknown> = {};
    if (existsSync(configPath)) {
      try {
        config = JSON.parse(readFileSync(configPath, "utf8")) as Record<
          string,
          unknown
        >;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        log.warn(`Skipping invalid OpenCode config ${configPath}: ${message}`);
        continue;
      }
    }

    const { config: merged, changed } = mergeOpenCodeGoEffortIntoConfig(
      config,
      patch,
    );
    if (!changed) continue;

    mkdirSync(dirname(configPath), { recursive: true });
    writeFileSync(configPath, JSON.stringify(merged, null, 2), "utf-8");
    anyChanged = true;
    log.info(
      `Synced opencode-go effort variants (${Object.keys(patch).length} model(s)) → ${configPath}`,
    );
  }

  return anyChanged;
}

export function modelsDevCachePath(serverDataDir: string): string {
  return join(serverDataDir, "cache", "opencode", "models.json");
}
