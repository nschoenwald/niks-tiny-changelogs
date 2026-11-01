import BaseSystemAdapter from "./base.mjs";
import { MOD_ID } from "../constants.mjs";
import { settingText, t } from "../i18n.mjs";
import { getWorldBool } from "../settings.mjs";
import { formatChange, formatLine, getActorLink, icon, readNumber, readRaw, willUpdatePath } from "../utils.mjs";

const ABILITIES_PATH = "system.abilities";
const OMENS_PATH = "system.omens.value";
// Remaining power uses of the day
const POWERS_PATH = "system.powerUses.value";
const SILVER_PATH = "system.silver";

export default class MorkBorgAdapter extends BaseSystemAdapter {
  registerSettings() {
    game.settings.register(MOD_ID, "trackMorkBorgAbilities", {
      ...settingText("trackMorkBorgAbilities"),
      scope: "world", config: true, type: Boolean, default: false
    });

    game.settings.register(MOD_ID, "trackMorkBorgOmens", {
      ...settingText("trackMorkBorgOmens"),
      scope: "world", config: true, type: Boolean, default: true
    });

    game.settings.register(MOD_ID, "trackMorkBorgPowers", {
      ...settingText("trackMorkBorgPowers"),
      scope: "world", config: true, type: Boolean, default: true
    });
  }

  // Container actors (carts, stashes) and the misery tracker are not characters
  isTrackedActor(actor) {
    return actor?.type !== "container" && actor?.type !== "misery-tracker";
  }

  isNpc(actor) {
    return actor?.type === "creature" || actor?.type === "follower";
  }

  getHealthPaths(actor) {
    return {
      hpPath: "system.hp.value",
      tempPath: null,
      tempMaxPath: null,
      damageSystem: false
    };
  }

  // Characters and followers keep silver as a flat number at system.silver, not in a currency object
  getCurrencyInfo(doc, manualBase) {
    if (manualBase || !(doc instanceof Actor)) return super.getCurrencyInfo(doc, manualBase);
    return Number.isFinite(Number(foundry.utils.getProperty(doc, SILVER_PATH))) ? [{ key: "silver", path: SILVER_PATH }] : [];
  }

  getCurrencyUpdatePaths(manualBase) {
    return [...super.getCurrencyUpdatePaths(manualBase), SILVER_PATH];
  }

  stashActorChanges(actor, change) {
    const stash = {};

    if (getWorldBool("trackMorkBorgAbilities") && willUpdatePath(change, ABILITIES_PATH)) {
      const keys = Object.keys(readRaw(actor, ABILITIES_PATH) ?? {});
      if (keys.length) stash.abilities = Object.fromEntries(keys.map(k => [k, readNumber(actor, `${ABILITIES_PATH}.${k}.value`)]));
    }

    if (getWorldBool("trackMorkBorgOmens") && willUpdatePath(change, OMENS_PATH)) {
      stash.omens = readNumber(actor, OMENS_PATH);
    }

    if (getWorldBool("trackMorkBorgPowers") && willUpdatePath(change, POWERS_PATH) && foundry.utils.hasProperty(actor, POWERS_PATH)) {
      stash.powers = readNumber(actor, POWERS_PATH);
    }

    return Object.keys(stash).length > 0 ? stash : null;
  }

  reportActorChanges(actor, stash, emit) {
    const link = getActorLink(actor);
    const isSimple = getWorldBool("simpleOutput");

    for (const [key, old] of Object.entries(stash.abilities ?? {})) {
      const now = readNumber(actor, `${ABILITIES_PATH}.${key}.value`);
      if (now === old) continue;
      const label = isSimple ? key.toUpperCase().slice(0, 3) : key.toUpperCase();
      emit(formatLine(icon("dice-d20"), link, `${label}: ${formatChange(old, now)}`), now > old ? "tiny-monitor-ability-gain" : "tiny-monitor-ability-loss", "ability");
    }

    if (stash.omens !== undefined) {
      const now = readNumber(actor, OMENS_PATH);
      if (now !== stash.omens) {
        emit(formatLine(icon("dice-d20"), link, `${t("Line.Omens")}: ${formatChange(stash.omens, now)}`), now > stash.omens ? "tiny-monitor-omens-gain" : "tiny-monitor-omens-loss", "omens");
      }
    }

    if (stash.powers !== undefined) {
      const delta = readNumber(actor, POWERS_PATH) - stash.powers;
      if (delta !== 0) {
        const abs = Math.abs(delta);
        const text = isSimple
          ? `${t("Line.Powers")}: ${delta > 0 ? "+" : "-"} ${abs}`
          : `${t("Line.Powers")}: ${t(`MorkBorg.Powers${delta < 0 ? "Used" : "Recovered"}${abs === 1 ? "One" : "Many"}`, { count: abs })}`;
        emit(formatLine(icon("hat-wizard"), link, text), delta < 0 ? "tiny-monitor-spellslot-expend" : "tiny-monitor-spellslot-regain", "spellslot");
      }
    }
  }
}
