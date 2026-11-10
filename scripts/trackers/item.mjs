// Item changes on actors: added, deleted, quantity, limited uses, rename, equip, container currency
// and system-specific item values.

import { MOD_ID } from "../constants.mjs";
import { adapter } from "../systems/index.mjs";
import { getWorldBool } from "../settings.mjs";
import { isNameBlacklisted } from "../blacklist.mjs";
import { buildRecipients, createEmitter } from "../messages.mjs";
import { stashCurrency, reportCurrency } from "../currency.mjs";
import ChangeDebouncer from "../debounce.mjs";
import {
  describeChange, escapeHTML, formatLine, getActorLink, getDelta, getItemLink, isSkipped, readNumber, readRaw, toneOf,
  updateTouchesRoots, willUpdatePath
} from "../utils.mjs";
import { getTrackedActor } from "./tracked-actor.mjs";
import { t } from "../i18n.mjs";

// Everything tracked on items lives under `system` or is the name
const ITEM_WATCHED_ROOTS = new Set(["system", "name"]);
const ITEM_DELETE_STASH = new WeakMap();

/** An item in a merged "Items" message, with its quantity when there is more than one. */
function itemEntry(html, qty) {
  return qty > 1 ? `${html} ×${qty}` : html;
}

/** Remaining limited uses of an item, read from spent or remaining uses depending on the system. */
function readRemainingUses(item, paths) {
  if (paths.usesValue) return readNumber(item, paths.usesValue);
  return readNumber(item, paths.usesMax) - readNumber(item, paths.usesSpent);
}

/**
 * Old values of everything tracked that the update will change.
 * @returns {object|null}  {qty, name, uses, equip, currency, system}, or null when nothing tracked changes
 */
function stashItemChanges(item, change) {
  const paths = adapter.getItemPaths(item);
  const trackItems = getWorldBool("trackItemChanges");
  const willUses = trackItems && (willUpdatePath(change, paths.usesSpent) || willUpdatePath(change, paths.usesValue))
    && readNumber(item, paths.usesMax) > 0;

  const stash = {
    qty: trackItems && willUpdatePath(change, paths.quantity) ? (readNumber(item, paths.quantity) || 0) : undefined,
    name: trackItems && willUpdatePath(change, "name") ? String(item.name ?? "") : undefined,
    uses: willUses ? readRemainingUses(item, paths) : undefined,
    equip: getWorldBool("trackEquipUnequip") && willUpdatePath(change, paths.equipped)
      ? Boolean(readRaw(item, paths.equipped)) : undefined,
    currency: isNameBlacklisted(item.name) ? undefined : stashCurrency(item, change),
    system: adapter.stashItemChanges(item, change) ?? undefined
  };
  return Object.values(stash).some(v => v !== undefined) ? stash : null;
}

function reportQuantity(item, old, emit) {
  const now = readNumber(item, adapter.getItemPaths(item).quantity) || 0;
  const delta = getDelta(old, now);
  if (delta === 0) return;
  const actor = getActorLink(item.parent);

  // Coins kept as items (PF2e) read as currency
  const coinLabel = adapter.getCoinItemLabel(item);
  if (coinLabel) {
    emit(formatLine({ icon: "coins", actor, text: escapeHTML(coinLabel), ...describeChange(old, now) }), "currency", "currency");
  }
  else if (old === 0 && now === 1) emit.group("items", "+", getItemLink(item));
  else if (old === 1 && now === 0) emit.group("items", "-", getItemLink(item));
  else emit(formatLine({ icon: "backpack", actor, text: getItemLink(item), ...describeChange(old, now) }), toneOf(delta), "item");
}

function reportItemChanges(item, stash) {
  const actor = item.parent;
  if (!actor) return;
  const emit = createEmitter(actor);

  if (stash.system) adapter.reportItemChanges(item, stash.system, emit);
  if (isNameBlacklisted(item.name)) return;

  const paths = adapter.getItemPaths(item);
  const actorLink = getActorLink(actor);
  const itemLink = getItemLink(item);

  if (stash.qty !== undefined) reportQuantity(item, stash.qty, emit);

  if (stash.uses !== undefined) {
    const max = readNumber(item, paths.usesMax);
    const now = readRemainingUses(item, paths);
    if (now !== stash.uses && max > 0) {
      const line = formatLine({
        icon: "battery-half", actor: actorLink, text: t("Line.ItemUses", { item: itemLink }),
        ...describeChange(stash.uses, now, { suffix: ` / ${max}` })
      });
      emit(line, toneOf(now - stash.uses, "spend"), "item-uses");
    }
  }

  if (stash.name !== undefined && item.name !== stash.name && !isNameBlacklisted(stash.name)) {
    emit(formatLine({ icon: "pen", actor: actorLink, text: `${escapeHTML(stash.name)} → ${itemLink}` }), "neutral", "item");
  }

  if (stash.equip !== undefined) {
    const now = Boolean(readRaw(item, paths.equipped));
    if (now !== stash.equip) {
      const text = t(now ? "Line.ItemEquipped" : "Line.ItemUnequipped", { item: itemLink });
      emit(formatLine({ icon: "shirt", actor: actorLink, text }), "neutral", "equip");
    }
  }

  if (stash.currency) reportCurrency(item, stash.currency, emit);
}

const debouncer = new ChangeDebouncer(reportItemChanges);

export function registerItemTracking() {
  Hooks.on("createItem", (item, options, userId) => {
    if (userId !== game.userId || isSkipped(options) || !getWorldBool("trackItemChanges")) return;
    const actor = getTrackedActor(item.parent);
    if (!actor || isNameBlacklisted(item.name)) return;

    const qty = readNumber(item, adapter.getItemPaths(item).quantity) || 1;
    const emit = createEmitter(actor);
    const coinLabel = adapter.getCoinItemLabel(item);
    if (coinLabel) {
      const line = formatLine({ icon: "coins", actor: getActorLink(actor), text: escapeHTML(coinLabel), ...describeChange(0, qty) });
      emit(line, "currency", "currency");
      return;
    }
    emit.group("items", "+", itemEntry(getItemLink(item), qty));
  });

  Hooks.on("preUpdateItem", (item, change, options, userId) => {
    if (isSkipped(options) || !getTrackedActor(item.parent)) return;
    if (!updateTouchesRoots(change, ITEM_WATCHED_ROOTS)) return;
    const stash = stashItemChanges(item, change);
    if (!stash) return;
    // Stored on the operation options (keyed by item ID, since one operation can update many items)
    // rather than a module-level map, so a no-op update cannot leave a stale stash behind.
    options[MOD_ID] ??= {};
    options[MOD_ID][item.id] = stash;
  });

  Hooks.on("updateItem", (item, change, options, userId) => {
    if (userId !== game.userId || isSkipped(options) || !(item.parent instanceof Actor)) return;
    const stash = options?.[MOD_ID]?.[item.id];
    // An update without tracked changes still extends a pending report
    if (stash || debouncer.has(item)) debouncer.push(item, stash);
  });

  Hooks.on("preDeleteItem", (item, options, userId) => {
    if (isSkipped(options) || !getWorldBool("trackItemChanges")) return;
    const actor = getTrackedActor(item.parent);
    if (!actor || isNameBlacklisted(item.name)) return;

    const qtyPath = adapter.getItemPaths(item).quantity;
    ITEM_DELETE_STASH.set(item, {
      // The actor's UUID and link, since the item and possibly the actor are gone when the message is built
      target: { uuid: actor.uuid, link: getActorLink(actor) },
      whisper: buildRecipients(actor),
      name: item.name,
      qty: readNumber(item, qtyPath),
      hasQty: Boolean(qtyPath) && foundry.utils.hasProperty(item, qtyPath),
      coinLabel: adapter.getCoinItemLabel(item)
    });
  });

  Hooks.on("deleteItem", (item, options, userId) => {
    if (userId !== game.userId || !getWorldBool("trackItemChanges")) return;
    const stash = ITEM_DELETE_STASH.get(item);
    ITEM_DELETE_STASH.delete(item);
    if (!stash || isNameBlacklisted(stash.name)) return;

    const { target, whisper, name, qty, hasQty, coinLabel } = stash;
    if (hasQty && qty === 0) return;
    const emit = createEmitter(target, whisper);

    if (coinLabel) {
      const line = formatLine({ icon: "coins", actor: target.link, text: escapeHTML(coinLabel), ...describeChange(qty, 0) });
      emit(line, "currency", "currency");
      return;
    }
    // Deleted items can't be linked any more
    emit.group("items", "-", itemEntry(escapeHTML(name), hasQty ? qty : 1));
  });
}
