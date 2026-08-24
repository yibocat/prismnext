import { templateDesktop } from "@/lib/desktop-api/template";
import type { TemplateMeta } from "@/components/modules/templates/types";

let _cache: TemplateMeta[] | null = null;
let _loading: Promise<TemplateMeta[]> | null = null;

/** Clear in-memory template list (e.g. when re-entering Template Center). */
export function invalidateTemplatesCache(): void {
  _cache = null;
  _loading = null;
}

/** Load templates via IPC. Result is cached in memory — first call hits IPC,
 *  subsequent calls return the cached data instantly. */
export async function getTemplates(options?: { refresh?: boolean }): Promise<TemplateMeta[]> {
  if (options?.refresh) invalidateTemplatesCache();
  if (_cache) return _cache;
  if (_loading) return _loading;

  _loading = templateDesktop.templateList().then((data) => {
    _cache = data ?? [];
    return _cache;
  });

  return _loading;
}
