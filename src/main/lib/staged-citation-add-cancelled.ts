import { STAGED_CITATION_ADD_CANCELLED } from "../../shared/literature/citation-staging";

export class StagedCitationAddCancelledError extends Error {
  constructor() {
    super(STAGED_CITATION_ADD_CANCELLED);
    this.name = "StagedCitationAddCancelledError";
  }
}

export function throwIfStagedCitationAddAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new StagedCitationAddCancelledError();
  }
}

export function rethrowIfStagedCitationAddAborted(err: unknown, signal?: AbortSignal): never {
  if (
    signal?.aborted ||
    (err instanceof DOMException && err.name === "AbortError")
  ) {
    throw new StagedCitationAddCancelledError();
  }
  throw err;
}
