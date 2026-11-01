import { t } from "../i18n.mjs";

// Coin keys with a translated label (lang/en.json "NTCL.Coin")
const COIN_LABELS = {
  pp: "Platinum", gp: "Gold", ep: "Electrum", sp: "Silver", cp: "Copper", silver: "Silver",
  gc: "GoldCrowns", ss: "SilverShillings", bits: "Bits"
};

/**
 * System adapter: everything the trackers need to know about a game system's data.
 * The defaults fit systems with D&D-like data; each supported system overrides what differs.
 *
 * Tracking a system-specific value takes two steps. Before an update, `stash*Changes` returns the old values
 * the update will change. After the update (debounced, so quick successive updates are reported once),
 * `report*Changes` receives the merged old values (the oldest of each field wins) and posts a line per change.
 */
export default class BaseSystemAdapter {
  // -------------------------------------------------------------------------
  // Configuration
  // -------------------------------------------------------------------------

  /**
   * Register system-specific settings in Foundry.
   */
  registerSettings() {}

  // -------------------------------------------------------------------------
  // Actor Types
  // -------------------------------------------------------------------------

  /**
   * Whether changes on this actor (and its items and effects) are tracked at all.
   * @param {Actor} actor
   * @returns {boolean}
   */
  isTrackedActor(actor) {
    return true;
  }

  /**
   * Whether the actor counts as an NPC for the NPC Message Audience setting.
   * @param {Actor} actor
   * @returns {boolean}
   */
  isNpc(actor) {
    return actor?.type === "npc";
  }

  // -------------------------------------------------------------------------
  // Health
  // -------------------------------------------------------------------------

  /**
   * Determine the health data paths for the given actor.
   * An optional `tempMaxLabel` overrides the "Temp Max" label used for changes at `tempMaxPath`.
   * With `damageSystem`, the value counts damage taken, so an increase is a loss.
   * @param {Actor} actor
   * @returns {{hpPath: string|null, tempPath: string|null, tempMaxPath: string|null, damageSystem: boolean, tempMaxLabel?: string}}
   */
  getHealthPaths(actor) {
    return { hpPath: null, tempPath: null, tempMaxPath: null, damageSystem: false };
  }

  // -------------------------------------------------------------------------
  // Currency
  // -------------------------------------------------------------------------

  /**
   * Data paths that can hold a currency object on this actor or item, in order of preference.
   * @param {Actor|Item} doc
   * @param {string|null} manualBase  The Currency Base Path setting
   * @returns {string[]}
   */
  getCurrencyPaths(doc, manualBase) {
    if (doc instanceof Item) return manualBase ? [manualBase, "system.currency", "system.currencies"] : ["system.currency", "system.currencies"];
    return manualBase ? [manualBase] : ["system.currency"];
  }

  /**
   * Known coin keys, in display order.
   * @returns {string[]}
   */
  getCoinKeys() {
    return ["pp", "gp", "ep", "sp", "cp"];
  }

  /**
   * The coins of an actor or item, from the first currency object found at `getCurrencyPaths`.
   * Items (e.g. containers) without known coin keys fall back to every numeric field of that object.
   * @param {Actor|Item} doc
   * @param {string|null} manualBase
   * @returns {{key: string, path: string}[]}  Coin key (for getCoinLabel) and full data path
   */
  getCurrencyInfo(doc, manualBase) {
    for (const basePath of this.getCurrencyPaths(doc, manualBase)) {
      const obj = foundry.utils.getProperty(doc, basePath);
      if (!obj || typeof obj !== "object") continue;
      let keys = this.getCoinKeys().filter(k => Object.hasOwn(obj, k));
      if (!keys.length && doc instanceof Item) keys = Object.keys(obj).filter(k => Number.isFinite(Number(obj[k])));
      return keys.map(key => ({ key, path: `${basePath}.${key}` }));
    }
    return [];
  }

  /**
   * Candidate data paths that can hold currency on actors or items.
   * @param {string|null} manualBase
   * @returns {string[]}
   */
  getCurrencyUpdatePaths(manualBase) {
    const paths = ["system.currency", "system.currencies"];
    return manualBase ? [manualBase, ...paths] : paths;
  }

  /**
   * Cheap pre-check whether an update can change currency, before resolving full currency info.
   * @param {object} update
   * @param {string|null} manualBase
   * @returns {boolean}
   */
  updateTouchesCurrency(update, manualBase) {
    return this.getCurrencyUpdatePaths(manualBase).some(p => foundry.utils.hasProperty(update, p));
  }

  /**
   * Determine the display label for a given coin key.
   * @param {string} key
   * @returns {string}
   */
  getCoinLabel(key) {
    return COIN_LABELS[key] ? t(`Coin.${COIN_LABELS[key]}`) : key.toUpperCase();
  }

  /**
   * For systems that keep coins as items: the coin label of an item whose quantity is an amount of money,
   * so its quantity changes are reported as currency. Null for any other item.
   * @param {Item} item
   * @returns {string|null}
   */
  getCoinItemLabel(item) {
    return null;
  }

  // -------------------------------------------------------------------------
  // Items
  // -------------------------------------------------------------------------

  /**
   * Data paths of the generic item values (quantity, limited uses, equipped). A null path is not tracked.
   * Limited uses are read either as spent uses (`usesSpent`) or as remaining uses (`usesValue`).
   * @param {Item} item
   * @returns {{quantity: string|null, usesMax: string|null, usesSpent: string|null, usesValue: string|null, equipped: string|null}}
   */
  getItemPaths(item) {
    return {
      quantity: "system.quantity",
      usesMax: "system.uses.max",
      usesSpent: "system.uses.spent",
      usesValue: null,
      equipped: "system.equipped"
    };
  }

  // -------------------------------------------------------------------------
  // System-specific Values
  // -------------------------------------------------------------------------

  /**
   * Old values of system-specific actor data that the update will change.
   * @param {Actor} actor
   * @param {object} change
   * @returns {object|null}  Null when nothing tracked changes
   */
  stashActorChanges(actor, change) {
    return null;
  }

  /**
   * Post a line for each system-specific actor value that changed.
   * @param {Actor} actor
   * @param {object} stash  Merged results of stashActorChanges
   * @param {import("../messages.mjs").Emit} emit
   */
  reportActorChanges(actor, stash, emit) {}

  /**
   * Old values of system-specific item data that the update will change.
   * @param {Item} item  An item owned by a tracked actor
   * @param {object} change
   * @returns {object|null}  Null when nothing tracked changes
   */
  stashItemChanges(item, change) {
    return null;
  }

  /**
   * Post a line for each system-specific item value that changed. Runs before the generic item report
   * (quantity, uses, rename, equip, currency), which always runs as well.
   * @param {Item} item
   * @param {object} stash  Merged results of stashItemChanges
   * @param {import("../messages.mjs").Emit} emit
   */
  reportItemChanges(item, stash, emit) {}
}
