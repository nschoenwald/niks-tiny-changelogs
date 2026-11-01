// Currency on actors and items (containers): stash before an update, report after it.

import { adapter } from "./systems/index.mjs";
import { getWorldBool, getWorldPath } from "./settings.mjs";
import { describeChange, formatLine, getActorLink, getDelta, getItemLink, readNumber, willUpdatePath } from "./utils.mjs";
import { t } from "./i18n.mjs";

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
 * @param {Actor|Item} doc   The actor, or a container item on an actor
 * @param {Record<string, {path: string, old: number}>} stash  From stashCurrency
 * @param {import("./messages.mjs").Emit} emit
 */
export function reportCurrency(doc, stash, emit) {
  const actor = doc instanceof Item ? doc.parent : doc;
  for (const [key, { path, old }] of Object.entries(stash ?? {})) {
    const now = readNumber(doc, path);
    if (getDelta(old, now) === 0) continue;
    const label = adapter.getCoinLabel(key);
    // Coins in a container name the container: "Gold in Backpack"
    const text = doc instanceof Item ? t("Line.CoinsIn", { coin: label, container: getItemLink(doc) }) : label;
    emit(formatLine({ icon: "coins", actor: getActorLink(actor), text, ...describeChange(old, now) }), "currency", "currency");
  }
}
