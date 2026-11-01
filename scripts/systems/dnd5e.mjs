import BaseSystemAdapter from "./base.mjs";
import { MOD_ID } from "../constants.mjs";
import { settingText, t } from "../i18n.mjs";
import { getWorldBool } from "../settings.mjs";
import { isNameBlacklisted } from "../blacklist.mjs";
import { describeChange, formatLine, getActorLink, getItemLink, readNumber, readRaw, toneOf, willUpdatePath } from "../utils.mjs";

const INSPIRATION_PATH = "system.attributes.inspiration";
const DEATH_SUCCESS_PATH = "system.attributes.death.success";
const DEATH_FAILURE_PATH = "system.attributes.death.failure";
const XP_PATH = "system.details.xp.value";
const SPELL_SLOT_KEYS = [1, 2, 3, 4, 5, 6, 7, 8, 9, "pact"];

function spellSlotPath(key) {
  return key === "pact" ? "system.spells.pact.value" : `system.spells.spell${key}.value`;
}

/** Whether a spell counts as prepared (dnd5e 5.x+: 0 = unprepared, 1 = prepared, 2 = always prepared). */
function isSpellPrepared(item) {
  return Number(readRaw(item, "system.prepared") ?? 0) >= 1;
}

/** "One" or "Many", to pick the singular or plural form of a translation. */
function amount(count) {
  return count === 1 ? "One" : "Many";
}

export default class Dnd5eAdapter extends BaseSystemAdapter {
  registerSettings() {
    game.settings.register(MOD_ID, "trackDnd5eInspiration", {
      ...settingText("trackDnd5eInspiration"),
      scope: "world", config: true, type: Boolean, default: true
    });

    game.settings.register(MOD_ID, "trackDnd5eDeathSaves", {
      ...settingText("trackDnd5eDeathSaves"),
      scope: "world", config: true, type: Boolean, default: true
    });

    game.settings.register(MOD_ID, "trackDnd5eSpellPrep", {
      ...settingText("trackDnd5eSpellPrep"),
      scope: "world", config: true, type: Boolean, default: true
    });

    game.settings.register(MOD_ID, "trackDnd5eSpellSlots", {
      ...settingText("trackDnd5eSpellSlots"),
      scope: "world", config: true, type: Boolean, default: true
    });

    game.settings.register(MOD_ID, "trackDnd5eHitDice", {
      ...settingText("trackDnd5eHitDice"),
      scope: "world", config: true, type: Boolean, default: true
    });

    game.settings.register(MOD_ID, "trackDnd5eXP", {
      ...settingText("trackDnd5eXP"),
      scope: "world", config: true, type: Boolean, default: true
    });
  }

  getHealthPaths(actor) {
    return {
      hpPath: "system.attributes.hp.value",
      tempPath: "system.attributes.hp.temp",
      tempMaxPath: "system.attributes.hp.tempmax",
      damageSystem: false
    };
  }

  getCurrencyPaths(doc, manualBase) {
    if (doc instanceof Item) return manualBase ? [manualBase, "system.currency"] : ["system.currency"];
    return super.getCurrencyPaths(doc, manualBase);
  }

  getCoinKeys() {
    return CONFIG.DND5E?.currencies ? Object.keys(CONFIG.DND5E.currencies) : super.getCoinKeys();
  }

  getCoinLabel(key) {
    const rawLabel = CONFIG.DND5E?.currencies?.[key]?.label;
    if (rawLabel) {
      const localized = game.i18n.localize(rawLabel);
      if (localized && localized !== rawLabel) return localized;
      if (localized && !rawLabel.startsWith("DND5E.")) return localized;
    }
    return super.getCoinLabel(key);
  }

  stashActorChanges(actor, change) {
    const stash = {};

    if (getWorldBool("trackDnd5eInspiration") && willUpdatePath(change, INSPIRATION_PATH)) {
      stash.inspiration = Boolean(readRaw(actor, INSPIRATION_PATH));
    }

    if (getWorldBool("trackDnd5eDeathSaves") && actor.type === "character"
      && (willUpdatePath(change, DEATH_SUCCESS_PATH) || willUpdatePath(change, DEATH_FAILURE_PATH))) {
      stash.deathSaves = {
        success: readNumber(actor, DEATH_SUCCESS_PATH),
        failure: readNumber(actor, DEATH_FAILURE_PATH)
      };
    }

    // Spell slots (levels 1-9 and Pact Magic)
    if (getWorldBool("trackDnd5eSpellSlots") && foundry.utils.hasProperty(change, "system.spells")) {
      const changed = SPELL_SLOT_KEYS.filter(k => willUpdatePath(change, spellSlotPath(k))
        && foundry.utils.hasProperty(actor, spellSlotPath(k)));
      if (changed.length) stash.spellSlots = Object.fromEntries(changed.map(k => [k, readNumber(actor, spellSlotPath(k))]));
    }

    if (getWorldBool("trackDnd5eXP") && actor.type === "character" && willUpdatePath(change, XP_PATH)) {
      stash.xp = readNumber(actor, XP_PATH);
    }

    return Object.keys(stash).length > 0 ? stash : null;
  }

  reportActorChanges(actor, stash, emit) {
    const link = getActorLink(actor);

    if (stash.inspiration !== undefined) {
      const now = Boolean(readRaw(actor, INSPIRATION_PATH));
      if (now !== stash.inspiration) {
        const text = t(now ? "Dnd5e.InspirationGained" : "Dnd5e.InspirationSpent");
        emit(formatLine({ icon: "dice-d20", actor: link, text }), now ? "gain" : "spend", "inspiration");
      }
    }

    if (stash.deathSaves) {
      const reportSaves = (path, old, type, iconName, gainIsGood) => {
        const now = readNumber(actor, path);
        const delta = now - old;
        if (delta === 0) return;
        const abs = Math.abs(delta);
        const text = t(`Dnd5e.${type}${delta > 0 ? "Gained" : "Lost"}${amount(abs)}`, { count: abs, now });
        const good = (delta > 0) === gainIsGood;
        emit(formatLine({ icon: iconName, actor: link, text }), good ? "gain" : "loss", "deathsave");
      };
      reportSaves(DEATH_SUCCESS_PATH, stash.deathSaves.success, "Success", "heart-pulse", true);
      reportSaves(DEATH_FAILURE_PATH, stash.deathSaves.failure, "Failure", "skull", false);
    }

    if (stash.spellSlots) {
      // Object keys come back as strings; report in slot order with Pact Magic last
      for (const key of SPELL_SLOT_KEYS) {
        const old = stash.spellSlots[key];
        if (old === undefined) continue;
        const now = readNumber(actor, spellSlotPath(key));
        if (now === old) continue;
        const slot = key === "pact" ? t("Dnd5e.SlotPact") : t("Dnd5e.SlotLevel", { level: key });
        const line = formatLine({ icon: "hat-wizard", actor: link, text: t("Dnd5e.Slots", { slot }), ...describeChange(old, now) });
        emit(line, toneOf(now - old, "spend"), "spellslot");
      }
    }

    if (stash.xp !== undefined) {
      const now = readNumber(actor, XP_PATH);
      if (now !== stash.xp) {
        const change = describeChange(stash.xp, now, { format: n => n.toLocaleString() });
        emit(formatLine({ icon: "star", actor: link, text: t("Line.XP"), ...change }), toneOf(now - stash.xp), "xp");
      }
    }
  }

  stashItemChanges(item, change) {
    const stash = {};

    if (getWorldBool("trackDnd5eSpellPrep") && item.type === "spell" && !isNameBlacklisted(item.name)
      && (willUpdatePath(change, "system.prepared") || willUpdatePath(change, "system.method"))) {
      stash.prepared = isSpellPrepared(item);
    }

    if (getWorldBool("trackDnd5eHitDice") && item.type === "class" && willUpdatePath(change, "system.hd.spent")) {
      stash.hdSpent = readNumber(item, "system.hd.spent");
    }

    return Object.keys(stash).length > 0 ? stash : null;
  }

  reportItemChanges(item, stash, emit) {
    if (stash.hdSpent !== undefined) {
      // Shown as Hit Dice left, so expending them reads as a decrease
      const max = readNumber(item, "system.hd.max") || readNumber(item, "system.levels");
      const before = max - stash.hdSpent;
      const after = max - readNumber(item, "system.hd.spent");
      if (before !== after) {
        const die = readRaw(item, "system.hd.denomination");
        const text = die ? t("Dnd5e.HitDiceDie", { die }) : t("Dnd5e.HitDice");
        // Without a known maximum, only the change is shown
        const change = max > 0 ? describeChange(before, after) : { delta: describeChange(0, after - before).delta };
        emit(formatLine({ icon: "heart-pulse", actor: getActorLink(item.parent), text, ...change }), toneOf(after - before, "spend"), "hitdice");
      }
    }

    if (stash.prepared !== undefined && !isNameBlacklisted(item.name)) {
      const now = isSpellPrepared(item);
      if (now !== stash.prepared) emit.group("spells", now ? "+" : "-", getItemLink(item));
    }
  }
}
