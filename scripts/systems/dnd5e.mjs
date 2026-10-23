import BaseSystemAdapter from "./base.mjs";

export default class Dnd5eAdapter extends BaseSystemAdapter {
  registerSettings() {
    game.settings.register(this.MOD_ID, "trackDnd5eInspiration", {
      name: "Track Inspiration",
      hint: "If enabled, logs when a character gains or uses Heroic Inspiration.",
      scope: "world", config: true, type: Boolean, default: true
    });

    game.settings.register(this.MOD_ID, "trackDnd5eDeathSaves", {
      name: "Track Death Saves",
      hint: "If enabled, logs successes and failures for Death Saving Throws on characters.",
      scope: "world", config: true, type: Boolean, default: true
    });

    game.settings.register(this.MOD_ID, "trackDnd5eSpellPrep", {
      name: "Track Spell Preparation",
      hint: "If enabled, logs when spells are prepared or unprepared on characters.",
      scope: "world", config: true, type: Boolean, default: true
    });

    game.settings.register(this.MOD_ID, "trackDnd5eSpellSlots", {
      name: "Track Spell Slots",
      hint: "If enabled, logs when spell slots are expended or regained.",
      scope: "world", config: true, type: Boolean, default: true
    });

    game.settings.register(this.MOD_ID, "trackDnd5eHitDice", {
      name: "Track Hit Dice",
      hint: "If enabled, logs when characters expend or regain Hit Dice.",
      scope: "world", config: true, type: Boolean, default: true
    });

    game.settings.register(this.MOD_ID, "trackDnd5eXP", {
      name: "Track Experience Points",
      hint: "If enabled, logs when a character gains or loses Experience Points.",
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

  getCurrencyInfo(actor, manualBase) {
    const info = super.getCurrencyInfo(actor, manualBase);
    if (info.basePath && CONFIG.DND5E?.currencies) {
      const obj = foundry.utils.getProperty(actor, info.basePath);
      if (obj && typeof obj === "object") {
        const all = Object.keys(CONFIG.DND5E.currencies);
        const coins = all.filter(k => Object.prototype.hasOwnProperty.call(obj, k));
        if (coins.length > 0) return { ...info, coins };
      }
    }
    return info;
  }

  getItemCurrencyInfo(item, manualBase) {
    const candidates = manualBase ? [manualBase, "system.currency"] : ["system.currency"];

    let basePath = null, obj = null;
    for (const p of candidates) {
      const o = foundry.utils.getProperty(item, p);
      if (o && typeof o === "object") { basePath = p; obj = o; break; }
    }
    if (!basePath) return { basePath: null, coins: [], isFlatCurrency: false };

    const all = CONFIG.DND5E?.currencies
      ? Object.keys(CONFIG.DND5E.currencies)
      : ["pp", "gp", "ep", "sp", "cp"];
    let coins = all.filter(k => Object.prototype.hasOwnProperty.call(obj, k));
    if (coins.length === 0) {
      coins = Object.keys(obj).filter(k => {
        const val = obj[k];
        return typeof val === "number" || Number.isFinite(Number(val));
      });
    }
    return { basePath, coins, isFlatCurrency: false };
  }

  getCoinLabel(denom) {
    const rawLabel = CONFIG.DND5E?.currencies?.[denom]?.label;
    if (rawLabel) {
      const localized = game.i18n.localize(rawLabel);
      if (localized && localized !== rawLabel) return localized;
      if (localized && !rawLabel.startsWith("DND5E.")) return localized;
    }
    const labels = { pp: "Platinum", gp: "Gold", ep: "Electrum", sp: "Silver", cp: "Copper" };
    return labels[denom] ?? super.getCoinLabel(denom);
  }

  buildPreUpdatePayload(actor, update, context) {
    const payload = {};

    // Inspiration
    if (context.getWorldBool("trackDnd5eInspiration")) {
      const inspPath = "system.attributes.inspiration";
      if (context.willUpdatePath(update, inspPath)) {
        payload.oldInspiration = Boolean(context.readRaw(actor, inspPath));
        payload.hasInspiration = true;
      }
    }

    // Death Saves
    if (context.getWorldBool("trackDnd5eDeathSaves") && actor.type === "character") {
      const successPath = "system.attributes.death.success";
      const failurePath = "system.attributes.death.failure";
      if (context.willUpdatePath(update, successPath) || context.willUpdatePath(update, failurePath)) {
        payload.deathSavesOld = {
          oldSucc: context.readNumber(actor, successPath),
          oldFail: context.readNumber(actor, failurePath)
        };
      }
    }

    // Spell Slots (Levels 1-9 and Pact Magic)
    if (context.getWorldBool("trackDnd5eSpellSlots", true) && foundry.utils.hasProperty(update, "system.spells")) {
      const slotKeys = [1, 2, 3, 4, 5, 6, 7, 8, 9, "pact"];
      const slotPaths = slotKeys.map(k => ({
        key: k,
        path: k === "pact" ? "system.spells.pact.value" : `system.spells.spell${k}.value`
      }));
      const changedSlots = slotPaths.filter(s => context.willUpdatePath(update, s.path) && foundry.utils.hasProperty(actor, s.path));
      if (changedSlots.length > 0) {
        payload.spellSlotsOld = Object.fromEntries(
          changedSlots.map(s => [s.key, { key: s.key, path: s.path, oldValue: context.readNumber(actor, s.path) }])
        );
      }
    }

    // XP
    const xpPath = "system.details.xp.value";
    if (context.getWorldBool("trackDnd5eXP", true) && actor.type === "character" && context.willUpdatePath(update, xpPath)) {
      payload.oldXP = context.readNumber(actor, xpPath);
    }

    return Object.keys(payload).length > 0 ? payload : null;
  }

  async processActorUpdate(actor, payload, context) {
    const { link, postMonitorMessage, readRaw, readNumber, getWorldBool } = context;

    // Inspiration
    if (payload.hasInspiration && payload.oldInspiration !== undefined) {
      const inspPath = "system.attributes.inspiration";
      const newInsp = Boolean(readRaw(actor, inspPath));
      if (newInsp !== payload.oldInspiration) {
        const icon = `<i class="fa-solid fa-dice-d20"></i>`;
        const line = `${icon} <span class="tm-actor">${link}</span> <span class="tm-text">${newInsp ? "gained" : "spent"} Heroic Inspiration</span>`;
        await postMonitorMessage(actor, line, "tiny-monitor-inspiration", "inspiration");
      }
    }

    // Death Saves
    if (payload.deathSavesOld) {
      const successPath = "system.attributes.death.success";
      const failurePath = "system.attributes.death.failure";
      const newSucc = readNumber(actor, successPath);
      const newFail = readNumber(actor, failurePath);
      const oldSucc = Number(payload.deathSavesOld.oldSucc ?? 0);
      const oldFail = Number(payload.deathSavesOld.oldFail ?? 0);

      // Successes
      if (newSucc !== oldSucc) {
        const delta = newSucc - oldSucc;
        const icon = `<i class="fa-solid fa-heart-pulse"></i>`;
        if (delta > 0) {
          const line = `${icon} <span class="tm-actor">${link}</span> <span class="tm-text">gained ${delta} Death Save ${delta === 1 ? 'Success' : 'Successes'} (${newSucc}/3)</span>`;
          await postMonitorMessage(actor, line, "tiny-monitor-gain", "deathsave");
        } else {
          const absDelta = Math.abs(delta);
          const line = `${icon} <span class="tm-actor">${link}</span> <span class="tm-text">lost ${absDelta} Death Save ${absDelta === 1 ? 'Success' : 'Successes'} (${newSucc}/3)</span>`;
          await postMonitorMessage(actor, line, "tiny-monitor-loss", "deathsave");
        }
      }

      // Failures
      if (newFail !== oldFail) {
        const delta = newFail - oldFail;
        const icon = `<i class="fa-solid fa-skull"></i>`;
        if (delta > 0) {
          const line = `${icon} <span class="tm-actor">${link}</span> <span class="tm-text">gained ${delta} Death Save ${delta === 1 ? 'Failure' : 'Failures'} (${newFail}/3)</span>`;
          await postMonitorMessage(actor, line, "tiny-monitor-loss", "deathsave");
        } else {
          const absDelta = Math.abs(delta);
          const line = `${icon} <span class="tm-actor">${link}</span> <span class="tm-text">lost ${absDelta} Death Save ${absDelta === 1 ? 'Failure' : 'Failures'} (${newFail}/3)</span>`;
          await postMonitorMessage(actor, line, "tiny-monitor-gain", "deathsave");
        }
      }
    }

    // Spell Slots
    if (payload.spellSlotsOld && Object.keys(payload.spellSlotsOld).length > 0) {
      const sortedKeys = Object.keys(payload.spellSlotsOld).sort((a, b) => {
        if (a === "pact") return 1;
        if (b === "pact") return -1;
        return Number(a) - Number(b);
      });
      for (const key of sortedKeys) {
        const slotData = payload.spellSlotsOld[key];
        const newVal = readNumber(actor, slotData.path);
        const oldVal = slotData.oldValue;
        const delta = newVal - oldVal;

        if (delta !== 0) {
          const icon = `<i class="fa-solid fa-hat-wizard"></i>`;
          const action = delta < 0 ? "expended" : "regained";
          const cls = delta < 0 ? "tiny-monitor-spellslot-expend" : "tiny-monitor-spellslot-regain";
          const absDelta = Math.abs(delta);
          const slotWord = absDelta === 1 ? "slot" : "slots";
          const quantityStr = absDelta > 1 ? `${absDelta} ` : "";
          const slotLabel = key === "pact" ? "Pact Magic" : `level ${key}`;
          const line = `${icon} <span class="tm-actor">${link}</span> <span class="tm-text">${action} ${quantityStr}${slotLabel} ${slotWord}</span>`;
          await postMonitorMessage(actor, line, cls, "spellslot");
        }
      }
    }

    // XP
    if (payload.oldXP !== undefined) {
      const newXP = readNumber(actor, "system.details.xp.value");
      const delta = newXP - payload.oldXP;
      if (delta !== 0) {
        const icon = `<i class="fa-solid fa-star"></i>`;
        const sign = delta > 0 ? "+" : "-";
        const abs = Math.abs(delta);
        const isSimple = getWorldBool("simpleOutput");
        const cls = delta > 0 ? "tiny-monitor-xp-gain" : "tiny-monitor-xp-loss";

        const text = isSimple
          ? `XP: ${sign} ${abs.toLocaleString()}`
          : `XP: ${payload.oldXP.toLocaleString()} ${sign} ${abs.toLocaleString()} → ${newXP.toLocaleString()}`;

        const line = `${icon} <span class="tm-actor">${link}</span> <span class="tm-text">${text}</span>`;
        await postMonitorMessage(actor, line, cls, "xp");
      }
    }
  }

  /** Whether a spell counts as prepared (dnd5e 5.x+: 0 = unprepared, 1 = prepared, 2 = always prepared). */
  dnd5eIsSpellPreparedLike(item, readRaw) {
    return Number(readRaw(item, "system.prepared") ?? 0) >= 1;
  }

  buildPreUpdateItemPayload(item, update, context) {
    const payload = {};
    const willPrep = context.getWorldBool("trackDnd5eSpellPrep") && item.type === "spell"
      && !context.isNameBlacklisted(item.name)
      && (context.willUpdatePath(update, "system.prepared") || context.willUpdatePath(update, "system.method"));

    const willHD = context.getWorldBool("trackDnd5eHitDice", true) && item.type === "class"
      && context.willUpdatePath(update, "system.hd.spent");

    if (willPrep) {
      payload.oldPrep = this.dnd5eIsSpellPreparedLike(item, context.readRaw);
    }

    if (willHD) {
      payload.oldHD = context.readNumber(item, "system.hd.spent");
    }

    return Object.keys(payload).length > 0 ? payload : null;
  }

  async processItemChange(item, action, context) {
    const { getWorldBool, postMonitorMessage, readRaw, getActorLink, escapeHTML, oldItemData, isNameBlacklisted } = context;
    if (action !== "update" || !oldItemData?.system) return;

    // Hit Dice
    if (item.type === "class" && getWorldBool("trackDnd5eHitDice", true) && oldItemData.system.oldHD !== undefined) {
      const oldUses = oldItemData.system.oldHD;
      const newUses = Number(readRaw(item, "system.hd.spent")) || 0;

      if (oldUses !== newUses) {
        const delta = newUses - oldUses; // Positive delta = used
        const actionStr = delta > 0 ? "expended" : "regained";
        const absDelta = Math.abs(delta);
        const icon = `<i class="fa-solid fa-heart-pulse"></i>`;
        const dieName = readRaw(item, "system.hd.denomination") || "Hit Dice";
        const word = absDelta === 1 ? dieName : `Hit Dice (${dieName})`;

        const link = getActorLink(item.parent);
        const cls = delta > 0 ? "tiny-monitor-hitdice-expend" : "tiny-monitor-hitdice-regain";
        const line = `${icon} <span class="tm-actor">${link}</span> <span class="tm-text">${actionStr} ${absDelta > 1 ? `${absDelta} ` : ""}${word}</span>`;
        await postMonitorMessage(item.parent, line, cls, "hitdice");
      }
    }

    // Spell Preparation
    if (item.type === "spell" && getWorldBool("trackDnd5eSpellPrep", true) && oldItemData.system.oldPrep !== undefined
      && !isNameBlacklisted(item.name)) {
      const isPreparedBefore = oldItemData.system.oldPrep;
      const isPreparedAfter = this.dnd5eIsSpellPreparedLike(item, readRaw);

      if (isPreparedBefore !== isPreparedAfter) {
        const icon = `<i class="fa-solid fa-book-journal-whills"></i>`;
        const link = getActorLink(item.parent);
        const safeItemName = escapeHTML(item.name);
        const actionStr = isPreparedAfter ? "prepared" : "unprepared";
        const line = `${icon} <span class="tm-actor">${link}</span> <span class="tm-text">${actionStr} ${safeItemName}</span>`;
        await postMonitorMessage(item.parent, line, "tiny-monitor-spellprep", "spellprep");
      }
    }
  }
}
