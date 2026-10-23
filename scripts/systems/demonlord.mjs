import BaseSystemAdapter from "./base.mjs";

export default class DemonlordAdapter extends BaseSystemAdapter {
  getHealthPaths(actor) {
    return {
      hpPath: "system.characteristics.health.value",
      tempPath: null,
      tempMaxPath: "system.characteristics.health.max",
      tempMaxLabel: "Max Health",
      damageSystem: true
    };
  }
}
