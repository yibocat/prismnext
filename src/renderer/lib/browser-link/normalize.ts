export function isBrowsableUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:" || u.protocol === "file:";
  } catch {
    return false;
  }
}

export function normalizeBrowserUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return trimmed;
  if (/^(https?|file):\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

export function linkLabelForUrl(url: string): string {
  try {
    const u = new URL(normalizeBrowserUrl(url));
    if (u.protocol === "file:") {
      const path = u.pathname.split("/").filter(Boolean);
      return path[path.length - 1] || "file";
    }
    return u.hostname.replace(/^www\./, "");
  } catch {
    return url.slice(0, 48);
  }
}

/** Method / attribute names often mistaken as a TLD when pasting code (e.g. time.sleep). */
const CODE_LIKE_TLDS = new Set([
  "sleep", "join", "map", "filter", "split", "replace", "format", "strip",
  "lower", "upper", "append", "extend", "range", "copy", "clone", "close",
  "read", "write", "open", "run", "test", "py", "js", "ts", "go", "rb",
  "len", "str", "int", "float", "bool", "list", "dict", "set", "get", "put",
  "min", "max", "sum", "abs", "all", "any", "pop", "push", "add", "sub",
  "item", "items", "keys", "values", "find", "sort", "size", "type", "name",
  "path", "text", "html", "json", "xml", "csv", "log", "warn", "error",
]);

/** Common real TLDs for bare-domain auto-link (no scheme). */
const COMMON_TLDS = new Set([
  "com", "org", "net", "edu", "gov", "mil", "int", "io", "co", "uk", "de",
  "fr", "jp", "cn", "au", "ca", "us", "app", "dev", "ai", "me", "tv", "info",
  "biz", "xyz", "tech", "blog", "site", "online", "store", "cloud", "live",
  "pro", "top", "club", "shop", "work", "mobi", "name", "eu", "ru", "br",
  "in", "kr", "nl", "se", "ch", "at", "be", "nz", "za", "sg", "hk", "tw",
  "es", "it", "pl", "no", "fi", "dk", "ie", "mx", "ar", "id", "my", "ph",
  "vn", "th", "tr", "ua", "cz", "hu", "ro", "sk", "bg", "hr", "lt", "lv",
  "ee", "pt", "gr", "il", "ae", "sa", "pk", "bd", "ng", "ke", "gh",
]);

/** Whether a bare host (no scheme) should auto-link — rejects code like time.sleep. */
export function isLikelyInternetDomain(text: string): boolean {
  const host = text.trim().split(/[/?#]/)[0]?.toLowerCase() ?? "";
  if (!/^[\w-]+(\.[\w-]+)+$/i.test(host)) return false;

  const parts = host.split(".");
  const tld = parts[parts.length - 1] ?? "";
  if (!/^[a-z]{2,24}$/.test(tld)) return false;
  if (CODE_LIKE_TLDS.has(tld)) return false;
  if (!COMMON_TLDS.has(tld)) return false;

  const sld = parts[parts.length - 2] ?? "";
  return sld.length >= 2;
}

/** Rough check before URL() — explicit URLs or validated bare domains. */
export function looksLikeUrl(text: string): boolean {
  const t = text.trim();
  if (/^https?:\/\//i.test(t) || /^file:\/\//i.test(t)) return true;
  if (/^www\.\S+/i.test(t)) return true;
  return isLikelyInternetDomain(t);
}
