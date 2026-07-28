/**
 * Write-time disk validation for figure.script (main process only).
 *
 * Mirrors figure.static: pure contract helpers live in
 * `src/shared/interaction-script.ts` (renderer-safe); reading/statting
 * files stays here so Vite never pulls `node:fs` into the browser bundle.
 */
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { normalizeFigureResourceProjectPath } from "../../shared/interaction-figure";
import type { InteractionResource, InteractionSpec } from "../../shared/interaction-spec";
import {
  SCRIPT_MAX_BYTES,
  SCRIPT_RESOURCES_MAX_BYTES,
  assertScriptHardBans,
  hasRenderExport,
  isInteractionScriptKind,
  scriptResourcePath,
  stripScriptComments,
} from "../../shared/interaction-script";

export type ScriptValidationResult =
  | { ok: true; scriptPath: string; threeEnabled: boolean }
  | { ok: false; error: string };

function resourcePath(r: InteractionResource): string | null {
  const p = (r.path ?? r.artifactPath)?.trim();
  return p || null;
}

/**
 * Reads resources[role="script"] off disk (<=SCRIPT_MAX_BYTES), runs the
 * static ban-scan, requires an exported `render`, and sums declared resource
 * file sizes against SCRIPT_RESOURCES_MAX_BYTES (stat only — content is read
 * later, per render path in the panel view / offscreen thumbnail capture).
 */
export function validateScriptSpec(
  projectRoot: string,
  spec: InteractionSpec,
): ScriptValidationResult {
  if (!isInteractionScriptKind(spec.kind)) {
    return { ok: false, error: `unsupported kind "${spec.kind}"` };
  }

  const rawPath = scriptResourcePath(spec.resources);
  if (!rawPath) {
    return {
      ok: false,
      error:
        'figure.script requires resources[] with a script path (e.g. resources: [{ role: "script", path: "script.js" }] after saving the file under .prismnext/artifacts/<id>/)',
    };
  }

  const relPath = normalizeFigureResourceProjectPath(spec, rawPath);
  const abs = join(projectRoot, relPath);
  let stat: ReturnType<typeof statSync>;
  try {
    stat = statSync(abs);
  } catch {
    return { ok: false, error: `script resource not found on disk: ${relPath}` };
  }
  if (!stat.isFile()) {
    return { ok: false, error: `script resource is not a file: ${relPath}` };
  }
  if (stat.size > SCRIPT_MAX_BYTES) {
    return {
      ok: false,
      error: `figure.script script.js too large (${stat.size} > ${SCRIPT_MAX_BYTES} bytes limit): ${relPath}`,
    };
  }

  let text: string;
  try {
    text = readFileSync(abs, "utf8");
  } catch {
    return { ok: false, error: `could not read script resource: ${relPath}` };
  }

  try {
    assertScriptHardBans(text);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "script contains a banned construct" };
  }

  if (!hasRenderExport(stripScriptComments(text))) {
    return {
      ok: false,
      error: "figure.script must export function render(ctx) { ... } — no mount/setup/main alias is accepted.",
    };
  }

  let othersBytes = 0;
  for (const r of spec.resources ?? []) {
    if (r.role === "script") continue;
    const p = resourcePath(r);
    if (!p) continue;
    const otherAbs = join(projectRoot, normalizeFigureResourceProjectPath(spec, p));
    try {
      othersBytes += statSync(otherAbs).size;
    } catch {
      return { ok: false, error: `resource not found on disk: ${p}` };
    }
  }
  if (othersBytes > SCRIPT_RESOURCES_MAX_BYTES) {
    return {
      ok: false,
      error: `figure.script resources too large combined (${othersBytes} > ${SCRIPT_RESOURCES_MAX_BYTES} bytes limit)`,
    };
  }

  const threeEnabled = spec.model?.three === true;
  return { ok: true, scriptPath: relPath, threeEnabled };
}
