export default class BaseSystemAdapter {
  constructor(modId) {
    this.MOD_ID = modId;
  }

  // -------------------------------------------------------------------------
  // Configuration
  // -------------------------------------------------------------------------

  /**
   * Register system-specific settings in Foundry.
   */
  registerSettings() {}

  // -------------------------------------------------------------------------
  // Path Detection & Labels
  // -------------------------------------------------------------------------

  /**
   * Determine the health data paths for the given actor.
   * An optional `tempMaxLabel` overrides the "Temp Max" label used for changes at `tempMaxPath`.
   * @param {Actor} actor
   * @returns {{hpPath: string|null, tempPath: string|null, tempMaxPath: string|null, damageSystem: boolean, tempMaxLabel?: string}}
   */
  getHealthPaths(actor) {
    return { hpPath: null, tempPath: null, tempMaxPath: null, damageSystem: false };
  }

  /**
   * Determine the currency paths and coins array.
   * @param {Actor} actor 
   * @param {string|null} manualBase 
   * @returns {{basePath: string|null, coins: string[], isFlatCurrency: boolean}}
   */
  getCurrencyInfo(actor, manualBase) {
    const candidates = manualBase ? [manualBase] : ["system.currency"];

    let basePath = null, obj = null;
    for (const p of candidates) {
      const o = foundry.utils.getProperty(actor, p);
      if (o && typeof o === "object") { basePath = p; obj = o; break; }
    }
    if (!basePath) return { basePath: null, coins: [], isFlatCurrency: false };

    const all = ["pp", "gp", "ep", "sp", "cp"];
    const coins = all.filter(k => Object.prototype.hasOwnProperty.call(obj, k));
    return { basePath, coins, isFlatCurrency: false };
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
   * Determine the currency paths and coins array for an item (e.g. container).
   * @param {Item} item 
   * @param {string|null} manualBase 
   * @returns {{basePath: string|null, coins: string[], isFlatCurrency: boolean}}
   */
  getItemCurrencyInfo(item, manualBase) {
    const candidates = manualBase ? [manualBase, "system.currency", "system.currencies"] : ["system.currency", "system.currencies"];

    let basePath = null, obj = null;
    for (const p of candidates) {
      const o = foundry.utils.getProperty(item, p);
      if (o && typeof o === "object") { basePath = p; obj = o; break; }
    }
    if (!basePath) return { basePath: null, coins: [], isFlatCurrency: false };

    const all = ["pp", "gp", "ep", "sp", "cp"];
    let coins = all.filter(k => Object.prototype.hasOwnProperty.call(obj, k));
    if (coins.length === 0) {
      coins = Object.keys(obj).filter(k => {
        const val = obj[k];
        return typeof val === "number" || Number.isFinite(Number(val));
      });
    }
    return { basePath, coins, isFlatCurrency: false };
  }

  /**
   * Determine the display label for a given currency denominator.
   * @param {string} denom 
   * @returns {string}
   */
  getCoinLabel(denom) {
    return denom.toUpperCase();
  }

  // -------------------------------------------------------------------------
  // Actor Updates
  // -------------------------------------------------------------------------

  /**
   * Extracts system-specific values from the actor prior to an update.
   * The returned payload is merged into the debounce context.
   * @param {Actor} actor 
   * @param {object} update 
   * @param {object} context 
   * @returns {object|null}
   */
  buildPreUpdatePayload(actor, update, context) {
    return null;
  }

  /**
   * Process the system-specific payload and post messages if needed.
   * @param {Actor} actor 
   * @param {object} payload 
   * @param {object} context (includes getWorldBool, readNumber, readRaw, postMonitorMessage, link, options)
   */
  async processActorUpdate(actor, payload, context) {}

  // -------------------------------------------------------------------------
  // Item Updates
  // -------------------------------------------------------------------------

  /**
   * Extracts system-specific values from the item prior to an update.
   * @param {Item} item
   * @param {object} update
   * @param {object} context
   * @returns {object|null}
   */
  buildPreUpdateItemPayload(item, update, context) {
    return null;
  }

  /**
   * Post system-specific messages for a debounced item update. Runs before the generic
   * item processing (quantity, uses, rename, equip, currency), which always runs as well.
   * @param {Item} item
   * @param {string} action
   * @param {object} context (includes oldItemData with the merged `system` payload)
   */
  async processItemChange(item, action, context) {}
}
