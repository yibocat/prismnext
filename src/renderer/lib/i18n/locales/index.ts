/**
 * Aggregated locale catalogs.
 *
 * Each language lives in a folder `locales/<lang>/<topKey>.json` (one file per
 * top-level i18n namespace). Adding a new language only requires dropping a new
 * folder here — the glob below picks it up automatically.
 */

export type LocaleCatalog = Record<string, unknown>;

type CatalogEntry = { lang: string; key: string; catalog: LocaleCatalog };

function collect(): CatalogEntry[] {
  const modules = import.meta.glob<{ default: unknown }>("./*/[a-z]*.json", {
    eager: true,
  });
  const entries: CatalogEntry[] = [];
  for (const path of Object.keys(modules)) {
    const match = /\.\/([^/]+)\/([A-Za-z][A-Za-z0-9-]*)\.json$/.exec(path);
    if (!match) continue;
    const [, lang, key] = match;
    const value = modules[path]?.default;
    if (value && typeof value === "object") {
      entries.push({ lang, key, catalog: value as LocaleCatalog });
    }
  }
  return entries;
}

/** Merge per-topKey files back into one catalog per language. */
function buildResources(): Record<string, { translation: LocaleCatalog }> {
  const resources: Record<string, { translation: LocaleCatalog }> = {};
  for (const { lang, key, catalog } of collect()) {
    resources[lang] ??= { translation: {} };
    resources[lang].translation[key] = catalog;
  }
  return resources;
}

export const resources = buildResources();
