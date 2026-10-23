import BaseSystemAdapter from "./base.mjs";

export default class ShadowdarkAdapter extends BaseSystemAdapter {
  getHealthPaths(actor) {
    return {
      hpPath: "system.attributes.hp.value",
      tempPath: null,
      tempMaxPath: null,
      damageSystem: false
    };
  }

  // Shadowdark player characters keep coins at system.coins (gp, sp, cp)
  getCurrencyUpdatePaths(manualBase) {
    return [...super.getCurrencyUpdatePaths(manualBase), "system.coins"];
  }

  getCurrencyInfo(actor, manualBase) {
    if (manualBase) return super.getCurrencyInfo(actor, manualBase);
    const obj = foundry.utils.getProperty(actor, "system.coins");
    if (!obj || typeof obj !== "object") return { basePath: null, coins: [], isFlatCurrency: false };
    const coins = ["gp", "sp", "cp"].filter(k => Object.hasOwn(obj, k));
    return { basePath: "system.coins", coins, isFlatCurrency: false };
  }

  getCoinLabel(denom) {
    const labels = { gp: "Gold", sp: "Silver", cp: "Copper" };
    return labels[denom] ?? super.getCoinLabel(denom);
  }
}
