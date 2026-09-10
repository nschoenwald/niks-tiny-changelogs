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
    return super.getCurrencyInfo(actor, manualBase); // Uses standard "system.currency"
  }

  getCoinLabel(denom) {
    const labels = { pp: "Platinum", gp: "Gold", ep: "Electrum", sp: "Silver", cp: "Copper" };
    return labels[denom] ?? super.getCoinLabel(denom);
  }

  buildPreUpdatePayload(actor, update, context) {
    const payload = {};
    const sys = "dnd5e";

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

  // Helper for DnD5e Spell Prep
  dnd5eIsSpellPreparedLike(item, readRaw) {
    const prepMode = readRaw(item, "system.preparation.mode");
    const legacyPrep = readRaw(item, "system.preparation.prepared");
    if (prepMode !== undefined || legacyPrep !== undefined) {
      // Legacy DnD5e (< 5.0)
      if (prepMode === "always") return true;
      if (prepMode === "prepared") return Boolean(legacyPrep);
      if (!prepMode && legacyPrep !== undefined) return Boolean(legacyPrep);
      return false;
    }

    // Modern DnD5e (5.0+, 6.0+)
    const preparedVal = readRaw(item, "system.prepared");
    if (typeof preparedVal === "number") {
      return preparedVal >= 1; // 1 = prepared, 2 = always (CONFIG.DND5E.spellPreparationStates)
    }
    if (typeof preparedVal === "boolean") {
      return preparedVal;
    }
    return false;
  }

  buildPreUpdateItemPayload(item, update, context) {
    const payload = {};
    const willPrep = context.getWorldBool("trackDnd5eSpellPrep") && item.type === "spell" && 
      (!context.isNameBlacklisted || !context.isNameBlacklisted(item.name)) &&
      (context.willUpdatePath(update, "system.prepared") || context.willUpdatePath(update, "system.preparation.prepared") || context.willUpdatePath(update, "system.method") || context.willUpdatePath(update, "system.preparation.mode"));

    const willHD = context.getWorldBool("trackDnd5eHitDice", true) && item.type === "class" &&
      (context.willUpdatePath(update, "system.hitDiceUsed") || context.willUpdatePath(update, "system.hd.spent"));

    if (willPrep) {
      payload.oldPrep = this.dnd5eIsSpellPreparedLike(item, context.readRaw);
    }
    
    if (willHD) {
      let oldHDVal = context.readRaw(item, "system.hd.spent") ?? context.readRaw(item, "system.hitDiceUsed");
      payload.oldHD = Number.isFinite(Number(oldHDVal)) ? Number(oldHDVal) : 0;
    }

    return Object.keys(payload).length > 0 ? payload : null;
  }

  async processItemChange(item, action, context) {
    const { getWorldBool, postMonitorMessage, readRaw, getActorLink, escapeHTML, oldItemData, isNameBlacklisted } = context;
    if (action !== "update" || !oldItemData?.system) return false;

    // Check hit dice changes
    if (item.type === "class" && getWorldBool("trackDnd5eHitDice", true) && oldItemData.system.oldHD !== undefined) {
      const oldUses = oldItemData.system.oldHD;
      let newUses = readRaw(item, "system.hd.spent") ?? readRaw(item, "system.hitDiceUsed");
      newUses = Number.isFinite(Number(newUses)) ? Number(newUses) : 0;
      
      if (oldUses !== newUses) {
        const delta = newUses - oldUses; // Positive delta = used
        const actionStr = delta > 0 ? "expended" : "regained";
        const absDelta = Math.abs(delta);
        const icon = `<i class="fa-solid fa-heart-pulse"></i>`;
        const dieName = readRaw(item, "system.hd.denomination") || readRaw(item, "system.hitDice") || "Hit Dice";
        const word = absDelta === 1 ? dieName : `Hit Dice (${dieName})`;

        const link = getActorLink(item.parent);
        const cls = delta > 0 ? "tiny-monitor-loss" : "tiny-monitor-gain";
        const line = `${icon} <span class="tm-actor">${link}</span> <span class="tm-text">${actionStr} ${absDelta > 1 ? `${absDelta} ` : ""}${word}</span>`;
        await postMonitorMessage(item.parent, line, cls, "hitdice");
        return true; // We handled it, don't log generic item qty changes for this
      }
    }

    // Spell Preparation
    if (item.type === "spell" && getWorldBool("trackDnd5eSpellPrep", true) && oldItemData.system.oldPrep !== undefined) {
      if (isNameBlacklisted && isNameBlacklisted(item.name)) return true;
      const isPreparedBefore = oldItemData.system.oldPrep;
      // Because we evaluate this *after* the update, we can just check the new state
      const isPreparedAfter = this.dnd5eIsSpellPreparedLike(item, readRaw);
      
      if (isPreparedBefore !== isPreparedAfter) {
        const icon = `<i class="fa-solid fa-book-journal-whills"></i>`;
        const link = getActorLink(item.parent);
        const safeItemName = escapeHTML(item.name);
        const actionStr = isPreparedAfter ? "prepared" : "unprepared";
        const line = `${icon} <span class="tm-actor">${link}</span> <span class="tm-text">${actionStr} ${safeItemName}</span>`;
        await postMonitorMessage(item.parent, line, "tiny-monitor-spellprep", "spellprep");
        return true;
      }
    }
    
    return false;
  }
}
