import type { TemplateMeta } from "@/components/modules/templates/types";

let _cache: TemplateMeta[] | null = null;
let _loading: Promise<TemplateMeta[]> | null = null;

/** Load templates via IPC. Result is cached in memory — first call hits IPC,
 *  subsequent calls return the cached data instantly. */
export async function getTemplates(): Promise<TemplateMeta[]> {
  if (_cache) return _cache;
  if (_loading) return _loading;

  _loading = window.electronAPI.templateList().then((data) => {
    _cache = data ?? [];
    return _cache;
  });

  return _loading;
}
