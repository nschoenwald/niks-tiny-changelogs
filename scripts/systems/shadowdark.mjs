import BaseSystemAdapter from "./base.mjs";

export default class ShadowdarkAdapter extends BaseSystemAdapter {
  // Dropped light sources become "Light" actors that every player owns
  isTrackedActor(actor) {
    return actor?.type !== "Light";
  }

  isNpc(actor) {
    return actor?.type === "NPC";
  }

  getHealthPaths(actor) {
    return {
      hpPath: "system.attributes.hp.value",
      tempPath: null,
      tempMaxPath: null,
      damageSystem: false
    };
  }

  // Player characters keep coins at system.coins (gp, sp, cp)
  getCurrencyPaths(doc, manualBase) {
    if (doc instanceof Actor && !manualBase) return ["system.coins"];
    return super.getCurrencyPaths(doc, manualBase);
  }

  getCoinKeys() {
    return ["gp", "sp", "cp"];
  }

  getCurrencyUpdatePaths(manualBase) {
    return [...super.getCurrencyUpdatePaths(manualBase), "system.coins"];
  }

  // Class abilities count remaining uses at system.uses.available
  getItemPaths(item) {
    return { ...super.getItemPaths(item), usesSpent: null, usesValue: "system.uses.available" };
  }
}
