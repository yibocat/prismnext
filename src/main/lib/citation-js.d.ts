/**
 * Type shim for `@citation-js/core`.
 *
 * The package ships without `.d.ts` (JS-only), so `tsc` would otherwise report
 * `TS7016: Could not find a declaration file` for every importer. Only `Cite`
 * is used (in `lib/bibtex-parse.ts` and `services/literature-service.ts`), and
 * only a small slice of its API (parse + format). The shim mirrors just that;
 * `any` is intentional — the real Cite API is large and we only need it to be
 * callable + chainable for BibTeX parse/format round-trips.
 */

declare module "@citation-js/core" {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  interface Cite {
    format(format: string, opts?: Record<string, unknown>): string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: any[];
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type CiteInput = any;

  /** Construct a Cite instance from BibTeX/JSON/etc. Also callable as a
   *  function: `Cite(input)` / `Cite.async(input)`. */
  export const Cite: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    new (input: CiteInput, opts?: Record<string, unknown>): Cite;
    (input: CiteInput, opts?: Record<string, unknown>): Cite;
    async(input: CiteInput, opts?: Record<string, unknown>): Promise<Cite>;
  };
}
