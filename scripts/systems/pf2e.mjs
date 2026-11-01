import BaseSystemAdapter from "./base.mjs";

export default class Pf2eAdapter extends BaseSystemAdapter {
  getHealthPaths(actor) {
    return {
      hpPath: "system.attributes.hp.value",
      tempPath: "system.attributes.hp.temp",
      tempMaxPath: null,
      damageSystem: false
    };
  }

  // PF2e keeps coins as treasure items: one item per denomination, its quantity is the amount
  getCoinItemLabel(item) {
    if (item.type !== "treasure" || !item.isCoinage) return null;
    const key = item.unit;
    const label = CONFIG.PF2E?.currencies?.[key];
    return label ? game.i18n.localize(label) : this.getCoinLabel(key ?? item.name);
  }

  // Consumables count remaining uses at system.uses.value; system.equipped is an object (carry type, hands held)
  getItemPaths(item) {
    return { ...super.getItemPaths(item), usesSpent: null, usesValue: "system.uses.value", equipped: null };
  }
}
