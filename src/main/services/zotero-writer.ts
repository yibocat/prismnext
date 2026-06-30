/**
 * ZoteroWriter — abstraction over Zotero collection/item write paths.
 *
 * The collection write backend (BBT debug-bridge vs Web API) is selected once
 * by `getZoteroWriter()` and encapsulated behind this interface, so callers
 * (zotero-sync, future push-to-Zotero flows) don't repeat the backend branching.
 *
 * Today the methods delegate to the existing functions in zotero-client. When
 * "push local paper to Zotero" lands, `createItem` / `uploadAttachment` will be
 * added here with one implementation per backend — keeping the write surface
 * in a single place.
 */
import type { ZoteroCollection } from "./zotero-client";
import {
  addItemsToZoteroCollection,
  createZoteroCollection,
  deleteZoteroCollection,
  removeItemFromZoteroCollection,
  renameZoteroCollection,
  resolveCollectionWriteBackend,
  type FetchFn,
} from "./zotero-client";

export interface ZoteroWriter {
  readonly backend: "bbt" | "web";
  createCollection(name: string, parentKey?: string | null): Promise<ZoteroCollection>;
  renameCollection(collectionKey: string, name: string): Promise<void>;
  deleteCollection(collectionKey: string): Promise<void>;
  addItems(collectionKey: string, itemKeys: string[]): Promise<void>;
  removeItem(collectionKey: string, itemKey: string): Promise<void>;
}

class DelegatingZoteroWriter implements ZoteroWriter {
  readonly backend: "bbt" | "web";
  private readonly fetchFn: FetchFn;

  constructor(backend: "bbt" | "web", fetchFn: FetchFn) {
    this.backend = backend;
    this.fetchFn = fetchFn;
  }

  createCollection(name: string, parentKey?: string | null): Promise<ZoteroCollection> {
    return createZoteroCollection(name, parentKey, this.fetchFn);
  }

  async renameCollection(collectionKey: string, name: string): Promise<void> {
    await renameZoteroCollection(collectionKey, name, this.fetchFn);
  }

  async deleteCollection(collectionKey: string): Promise<void> {
    await deleteZoteroCollection(collectionKey, this.fetchFn);
  }

  async addItems(collectionKey: string, itemKeys: string[]): Promise<void> {
    if (itemKeys.length === 0) return;
    await addItemsToZoteroCollection(collectionKey, itemKeys, this.fetchFn);
  }

  async removeItem(collectionKey: string, itemKey: string): Promise<void> {
    await removeItemFromZoteroCollection(collectionKey, itemKey, this.fetchFn);
  }
}

/**
 * Resolve the currently available Zotero write backend and return a writer
 * bound to it. Throws with an actionable message when no write channel exists.
 */
export async function getZoteroWriter(fetchFn: FetchFn = fetch): Promise<ZoteroWriter> {
  const { backend } = await resolveCollectionWriteBackend(fetchFn);
  return new DelegatingZoteroWriter(backend, fetchFn);
}
