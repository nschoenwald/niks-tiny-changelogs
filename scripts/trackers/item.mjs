// Item changes on actors: added, deleted, quantity, limited uses, rename, equip, container currency
// and system-specific item values.

import { MOD_ID } from "../constants.mjs";
import { adapter } from "../systems/index.mjs";
import { getWorldBool } from "../settings.mjs";
import { isNameBlacklisted } from "../blacklist.mjs";
import { buildRecipients, createEmitter, postMonitorMessage } from "../messages.mjs";
import { stashCurrency, reportCurrency } from "../currency.mjs";
import ChangeDebouncer from "../debounce.mjs";
import {
  escapeHTML, formatChange, formatLine, getActorLink, getDelta, icon, readNumber, readRaw, updateTouchesRoots, willUpdatePath
} from "../utils.mjs";
import { getTrackedActor } from "./tracked-actor.mjs";
import { t } from "../i18n.mjs";

// Everything tracked on items lives under `system` or is the name
const ITEM_WATCHED_ROOTS = new Set(["system", "name"]);
const ITEM_DELETE_STASH = new WeakMap();
const ITEM_ICON = icon("backpack");
const MULTILINE = { multiline: true };

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

function reportQuantity(item, old, link, safeName, emit) {
  const now = readNumber(item, adapter.getItemPaths(item).quantity) || 0;
  const delta = getDelta(old, now);
  if (delta === 0) return;

  // Coins kept as items (PF2e) read as currency
  const coinLabel = adapter.getCoinItemLabel(item);
  if (coinLabel) {
    const line = formatLine(icon("coins"), link, `${escapeHTML(coinLabel)}: ${formatChange(old, now)}`);
    emit(line, delta > 0 ? "tiny-monitor-currency-gain" : "tiny-monitor-currency-loss", "currency");
  }
  else if (old === 0 && now === 1) emit(`${ITEM_ICON} ${t("Line.ItemAdded", { actor: link, item: safeName })}`, "tiny-monitor-item-inc", "item", MULTILINE);
  else if (old === 1 && now === 0) emit(`${ITEM_ICON} ${t("Line.ItemDeleted", { actor: link, item: safeName })}`, "tiny-monitor-item-dec", "item", MULTILINE);
  else {
    const line = `${ITEM_ICON} ${link} ${safeName}: ${formatChange(old, now)}`;
    emit(line, delta > 0 ? "tiny-monitor-item-inc" : "tiny-monitor-item-dec", "item", MULTILINE);
  }
}

function reportItemChanges(item, stash) {
  const actor = item.parent;
  if (!actor) return;
  const emit = createEmitter(actor);

  if (stash.system) adapter.reportItemChanges(item, stash.system, emit);

  const blacklisted = isNameBlacklisted(item.name);
  const paths = adapter.getItemPaths(item);
  const link = getActorLink(actor);
  const safeName = escapeHTML(item.name || t("Line.Container"));

  if (stash.qty !== undefined && !blacklisted) reportQuantity(item, stash.qty, link, safeName, emit);

  if (stash.uses !== undefined && !blacklisted) {
    const max = readNumber(item, paths.usesMax);
    const now = readRemainingUses(item, paths);
    if (now !== stash.uses && max > 0) {
      const text = getWorldBool("simpleOutput")
        ? `${t("Line.Uses")}: ${formatChange(stash.uses, now)}`
        : `${t("Line.Uses")}: ${formatChange(stash.uses, now, { suffix: ` / ${max}` })}`;
      const cls = now > stash.uses ? "tiny-monitor-item-inc" : "tiny-monitor-item-dec";
      emit(`${icon("battery-half")} ${link} ${safeName}: ${text}`, cls, "item-uses", MULTILINE);
    }
  }

  if (stash.name !== undefined && item.name !== stash.name && !blacklisted && !isNameBlacklisted(stash.name)) {
    emit(`${ITEM_ICON} ${link} ${escapeHTML(stash.name)} → ${safeName}`, "tiny-monitor-item", "item", MULTILINE);
  }

  if (stash.equip !== undefined && !blacklisted) {
    const now = Boolean(readRaw(item, paths.equipped));
    if (now !== stash.equip) {
      const line = `${icon("shirt")} ${t(now ? "Line.ItemEquipped" : "Line.ItemUnequipped", { actor: link, item: safeName })}`;
      emit(line, now ? "tiny-monitor-equip" : "tiny-monitor-unequip", "equip", MULTILINE);
    }
  }

  if (stash.currency && !blacklisted) reportCurrency(item, stash.currency, `${link} (${safeName})`, emit);
}

const debouncer = new ChangeDebouncer(reportItemChanges);

export function registerItemTracking() {
  Hooks.on("createItem", (item, options, userId) => {
    if (userId !== game.userId || !getWorldBool("trackItemChanges")) return;
    const actor = getTrackedActor(item.parent);
    if (!actor || isNameBlacklisted(item.name)) return;

    const qty = readNumber(item, adapter.getItemPaths(item).quantity) || 1;
    const link = getActorLink(actor);
    const coinLabel = adapter.getCoinItemLabel(item);
    if (coinLabel) {
      const line = formatLine(icon("coins"), link, `${escapeHTML(coinLabel)}: ${formatChange(0, qty)}`);
      postMonitorMessage(actor, line, "tiny-monitor-currency-gain", "currency");
      return;
    }
    const safeName = escapeHTML(item.name);
    const line = (qty === 1 || getWorldBool("simpleOutput"))
      ? `${ITEM_ICON} ${t(qty > 1 ? "Line.ItemAddedQuantity" : "Line.ItemAdded", { actor: link, item: safeName, qty })}`
      : `${ITEM_ICON} ${link} (${safeName}): 0 + ${qty} → ${qty}`;
    postMonitorMessage(actor, line, "tiny-monitor-item-inc", "item", MULTILINE);
  });

  Hooks.on("preUpdateItem", (item, change, options, userId) => {
    if (!getTrackedActor(item.parent)) return;
    if (!updateTouchesRoots(change, ITEM_WATCHED_ROOTS)) return;
    const stash = stashItemChanges(item, change);
    if (!stash) return;
    // Stored on the operation options (keyed by item ID, since one operation can update many items)
    // rather than a module-level map, so a no-op update cannot leave a stale stash behind.
    options[MOD_ID] ??= {};
    options[MOD_ID][item.id] = stash;
  });

  Hooks.on("updateItem", (item, change, options, userId) => {
    if (userId !== game.userId || !(item.parent instanceof Actor)) return;
    const stash = options?.[MOD_ID]?.[item.id];
    // An update without tracked changes still extends a pending report
    if (stash || debouncer.has(item)) debouncer.push(item, stash);
  });

  Hooks.on("preDeleteItem", (item, options, userId) => {
    if (!getWorldBool("trackItemChanges")) return;
    const actor = getTrackedActor(item.parent);
    if (!actor || isNameBlacklisted(item.name)) return;

    const qtyPath = adapter.getItemPaths(item).quantity;
    ITEM_DELETE_STASH.set(item, {
      link: getActorLink(actor),
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

    const { hasQty, qty, link, whisper, name, coinLabel } = stash;
    if (hasQty && qty === 0) return;
    const emit = createEmitter(null, whisper);

    if (coinLabel) {
      const line = formatLine(icon("coins"), link, `${escapeHTML(coinLabel)}: ${formatChange(qty, 0)}`);
      emit(line, "tiny-monitor-currency-loss", "currency");
      return;
    }

    const safeName = escapeHTML(name);
    const line = (!hasQty || qty <= 1 || getWorldBool("simpleOutput"))
      ? `${ITEM_ICON} ${t("Line.ItemDeleted", { actor: link, item: safeName })}`
      : `${ITEM_ICON} ${link} ${safeName}: ${qty} - ${qty} → 0`;
    emit(line, "tiny-monitor-item-dec", "item", MULTILINE);
  });
}
