/**
 * Shared constants used across main, preload, and renderer processes.
 *
 * This file MUST remain free of Node.js or DOM imports — it is consumed
 * by every TypeScript project in the repo.
 */

/** Files larger than 5 MB are not auto-loaded into memory during project open / reload. */
export const LARGE_FILE_THRESHOLD = 5 * 1024 * 1024;

/** Text files larger than 10 MB are skipped during auto-load to avoid OOM. */
export const TEXT_FILE_SIZE_LIMIT = 10 * 1024 * 1024;
