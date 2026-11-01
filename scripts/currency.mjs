// Currency on actors and items (containers): stash before an update, report after it.

import { adapter } from "./systems/index.mjs";
import { getWorldBool, getWorldPath } from "./settings.mjs";
import { formatChange, formatLine, getDelta, icon, readNumber, willUpdatePath } from "./utils.mjs";

/**
 * Old coin values of a document, if the update changes any of its coins.
 * @param {Actor|Item} doc
 * @param {object} change
 * @returns {Record<string, {path: string, old: number}>|undefined}  Keyed by coin
 */
export function stashCurrency(doc, change) {
  if (!getWorldBool("trackCurrency", true)) return undefined;
  const manualBase = getWorldPath("currencyBasePath");
  if (!adapter.updateTouchesCurrency(change, manualBase)) return undefined;
  const coins = adapter.getCurrencyInfo(doc, manualBase);
  if (!coins.some(c => willUpdatePath(change, c.path))) return undefined;
  return Object.fromEntries(coins.map(c => [c.key, { path: c.path, old: readNumber(doc, c.path) }]));
}

/**
 * Post one line per coin that changed.
 * @param {Actor|Item} doc
 * @param {Record<string, {path: string, old: number}>} stash  From stashCurrency
 * @param {string} actorHtml                                     Actor (and container) shown in the line
 * @param {import("./messages.mjs").Emit} emit
 */
export function reportCurrency(doc, stash, actorHtml, emit) {
  for (const [key, { path, old }] of Object.entries(stash ?? {})) {
    const now = readNumber(doc, path);
    const delta = getDelta(old, now);
    if (delta === 0) continue;
    const text = `${adapter.getCoinLabel(key)}: ${formatChange(old, now)}`;
    emit(formatLine(icon("coins"), actorHtml, text), delta > 0 ? "tiny-monitor-currency-gain" : "tiny-monitor-currency-loss", "currency");
  }
}
