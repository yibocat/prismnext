type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const COLORS: Record<LogLevel, string> = {
  debug: "#888",
  info: "#3B82F6",
  warn: "#F59E0B",
  error: "#EF4444",
};

const MIN_LEVEL: LogLevel =
  typeof process !== "undefined" && process.env.NODE_ENV === "production"
    ? "info"
    : "debug";

function shouldLog(level: LogLevel): boolean {
  return LEVEL_ORDER[level] >= LEVEL_ORDER[MIN_LEVEL];
}

export function createLogger(module: string) {
  const tag = `[${module}]`;

  return {
    debug(msg: string, data?: unknown) {
      if (!shouldLog("debug")) return;
      console.debug(
        `%c[DEBUG]%c ${tag} ${msg}`,
        `color:${COLORS.debug}`,
        "",
        data ?? "",
      );
    },

    info(msg: string, data?: unknown) {
      if (!shouldLog("info")) return;
      console.info(
        `%c[INFO]%c ${tag} ${msg}`,
        `color:${COLORS.info}`,
        "",
        data ?? "",
      );
    },

    warn(msg: string, data?: unknown) {
      if (!shouldLog("warn")) return;
      console.warn(
        `%c[WARN]%c ${tag} ${msg}`,
        `color:${COLORS.warn}`,
        "",
        data ?? "",
      );
    },

    error(msg: string, data?: unknown) {
      if (!shouldLog("error")) return;
      console.error(
        `%c[ERROR]%c ${tag} ${msg}`,
        `color:${COLORS.error}`,
        "",
        data ?? "",
      );
    },
  };
}
