import BaseSystemAdapter from "./base.mjs";
import { t } from "../i18n.mjs";

export default class DemonlordAdapter extends BaseSystemAdapter {
  // Vehicles have nothing tracked but their health
  isTrackedActor(actor) {
    return actor?.type !== "vehicle";
  }

  isNpc(actor) {
    return actor?.type === "creature";
  }

  getHealthPaths(actor) {
    return {
      hpPath: "system.characteristics.health.value",
      tempPath: null,
      tempMaxPath: "system.characteristics.health.max",
      tempMaxLabel: t("Line.MaxHealth"),
      damageSystem: true
    };
  }

  // Actors keep coins at system.wealth, next to non-coin fields (lifestyle, description)
  getCurrencyPaths(doc, manualBase) {
    if (doc instanceof Actor && !manualBase) return ["system.wealth"];
    return super.getCurrencyPaths(doc, manualBase);
  }

  getCoinKeys() {
    return ["gc", "ss", "cp", "bits"];
  }

  getCurrencyUpdatePaths(manualBase) {
    return [...super.getCurrencyUpdatePaths(manualBase), "system.wealth"];
  }

  getCoinLabel(key) {
    return key === "cp" ? t("Coin.CopperPennies") : super.getCoinLabel(key);
  }

  // Talent uses and spell castings count spent uses; equipped items are "worn"
  getItemPaths(item) {
    const uses = item.type === "spell" ? "system.castings" : "system.uses";
    return {
      ...super.getItemPaths(item),
      usesMax: `${uses}.max`,
      usesSpent: `${uses}.value`,
      equipped: "system.wear"
    };
  }
}
