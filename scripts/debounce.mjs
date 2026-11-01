// Combines the stashed old values of quick successive updates to one document into one report.

import { MOD_ID, DEBOUNCE_MS } from "./constants.mjs";
import { mergeFirst } from "./utils.mjs";

export default class ChangeDebouncer {
  /** @type {Map<string, {stash: object, timer: number|null}>} Keyed by document UUID */
  #pending = new Map();

  /** @param {(doc: foundry.abstract.Document, stash: object) => void} report  Called with the merged old values */
  constructor(report) {
    this.report = report;
  }

  /** Whether changes of this document are waiting to be reported. */
  has(doc) {
    return this.#pending.has(doc.uuid);
  }

  /**
   * Merge the old values of one update into the pending ones (the oldest value of each field wins)
   * and restart the document's timer.
   * @param {foundry.abstract.Document} doc
   * @param {object|null} stash
   */
  push(doc, stash) {
    const uuid = doc.uuid;
    const entry = this.#pending.get(uuid) ?? { stash: {}, timer: null };
    clearTimeout(entry.timer);
    if (stash) mergeFirst(entry.stash, stash);
    entry.timer = setTimeout(() => {
      // Remove first, so an error below cannot leave stale old values behind for later updates
      this.#pending.delete(uuid);
      try {
        this.report(doc, entry.stash);
      } catch (err) {
        console.error(`[${MOD_ID}] Failed to report changes of ${uuid}:`, err);
      }
    }, DEBOUNCE_MS);
    this.#pending.set(uuid, entry);
  }
}
