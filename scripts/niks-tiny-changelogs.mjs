// Tiny HP Monitor for Foundry VTT
// Multi-system (auto-detect + configurable paths) with System Adapters.

import SystemManager from "./systems/index.mjs";
import CustomTrackerConfig from "./custom-tracker-config.mjs";

const MOD_ID = "niks-tiny-changelogs";
const MAX_NAME_CHARS = 25;
const DEBOUNCE_MS = 350;

let adapter;

// -------------------------------
// State & Storage
// -------------------------------
const ITEM_UPDATE_STASH = new WeakMap();
const ITEM_DELETE_STASH = new WeakMap();
const EFFECT_DELETE_STASH = new WeakMap();

// Debounce Maps: Key = Document UUID
const ACTOR_DEBOUNCE = new Map();
const ITEM_DEBOUNCE = new Map();

// -------------------------------
// Utilities
// -------------------------------

let cachedCustomResources = null;

export function clearCustomResourcesCache() {
  cachedCustomResources = null;
}

function getCustomResources() {
  if (cachedCustomResources !== null) return cachedCustomResources;
  const customSetting = game.settings.get(MOD_ID, "customTrackedResources");
  if (customSetting) {
    try {
      cachedCustomResources = JSON.parse(customSetting);
    } catch (e) {
      console.error(`[${MOD_ID}] Failed to parse customTrackedResources:`, e);
      cachedCustomResources = [];
    }
  } else {
    cachedCustomResources = [];
  }
  return cachedCustomResources;
}

function escapeHTML(str) {
  return foundry.utils.escapeHTML(String(str ?? ""));
}

function clipName(name) {
  const chars = Array.from(String(name ?? ""));
  if (chars.length <= MAX_NAME_CHARS) return chars.join("");
  return chars.slice(0, MAX_NAME_CHARS).join("") + "…";
}

function getActorLink(actor) {
  const rawName = actor?.token?.name ?? actor?.name ?? "";
  const label = clipName(rawName);
  return `@UUID[${actor?.uuid ?? ""}]{${label}}`;
}

function getWorldBool(key, def = false) {
  try { return Boolean(game.settings.get(MOD_ID, key)); } catch { return def; }
}

function getWorldPath(key) {
  try {
    const v = game.settings.get(MOD_ID, key);
    return (typeof v === "string" && v.trim().length) ? v.trim() : null;
  } catch { return null; }
}

function resolvePaths(actor) {
  if (getWorldBool("autoDetectPaths", true)) return adapter.getHealthPaths(actor);
  return {
    hpPath: getWorldPath("hpPath"),
    tempPath: getWorldPath("tempHpPath"),
    tempMaxPath: getWorldPath("tempHpMaxPath"),
    damageSystem: adapter.getHealthPaths(actor).damageSystem
  };
}

function readNumber(doc, path) {
  if (!path) return 0;
  const v = foundry.utils.getProperty(doc, path);
  return Number.isFinite(Number(v)) ? Number(v) : 0;
}

function readRaw(doc, path) {
  if (!path) return undefined;
  return foundry.utils.getProperty(doc, path);
}

function willUpdatePath(update, path) {
  return path && foundry.utils.hasProperty(update, path);
}

function buildRecipients(actor) {
  const gmUsers = game.users.filter(u => u.isGM);
  const owners = actor.testUserPermission
    ? game.users.filter(u => actor.testUserPermission(u, CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER))
    : [];

  const uniq = (...lists) => [...new Map(lists.flat().map(u => [u.id, u])).values()];

  // NPC-specific audience
  if (actor.type === "npc") {
    const npcMode = game.settings.get(MOD_ID, "npcAudience") ?? "gm-owners";
    if (npcMode === "gm") return gmUsers.map(u => u.id);
    if (npcMode === "gm-players") return uniq(gmUsers, game.users.filter(u => !u.isGM)).map(u => u.id);
  }

  // General whisper target setting
  const target = game.settings.get(MOD_ID, "whisperTarget") ?? "gm-player";

  if (target === "everyone") return [];  // empty array → public message
  if (target === "gm") return gmUsers.map(u => u.id);
  if (target === "player") {
    const playerOwners = owners.filter(u => !u.isGM);
    return playerOwners.length > 0 ? playerOwners.map(u => u.id) : gmUsers.map(u => u.id);
  }

  // Default: "gm-player" — GM + owners
  const recipients = uniq(gmUsers, owners).map(u => u.id);
  return recipients.length > 0 ? recipients : gmUsers.map(u => u.id);
}

function buildMonitorMessageData(actor, line, cls, kind, isMultiline = false, customColor = null) {
  const whisper = buildRecipients(actor);
  const cssLine = isMultiline ? "tiny-monitor-line tm-multiline" : "tiny-monitor-line";

  const flags = { isMonitorMsg: true, kind, cls };
  if (customColor) flags.customColor = customColor;

  const msgData = {
    content: `<div class="${cssLine}">${line}</div>`,
    flags: { [MOD_ID]: flags }
  };
  if (whisper.length > 0) msgData.whisper = whisper;
  return msgData;
}

async function postMonitorMessage(actor, line, cls, kind, isMultiline = false, customColor = null) {
  const msgData = buildMonitorMessageData(actor, line, cls, kind, isMultiline, customColor);
  await ChatMessage.create(msgData);
}

// -------------------------------
// Settings
// -------------------------------

Hooks.once("init", () => {
  // Initialize adapter early
  adapter = SystemManager.getAdapter(game.system.id, MOD_ID);

  game.settings.register(MOD_ID, "compactMessages", {
    name: "Compact Messages",
    hint: "If enabled, changelog messages are limited to a single line and expand when hovered over. Useful for keeping the chat log tidy.",
    scope: "world", config: true, type: Boolean, default: true
  });

  game.settings.register(MOD_ID, "simpleOutput", {
    name: "Simplified Output",
    hint: "If enabled, logs will only show the adjustment amount (e.g., '+5') instead of the full transition (e.g., '10 + 5 -> 15'). This provides a cleaner, less verbose chat log.",
    scope: "world", config: true, type: Boolean, default: false
  });

  game.settings.register(MOD_ID, "whisperTarget", {
    name: "Whisper Target",
    hint: "Determines who receives the changelog whisper messages for PC actors.",
    scope: "world", config: true, type: String,
    choices: { "gm-player": "GM + Player (default)", "player": "Player only", "gm": "GM only", "everyone": "Everyone" },
    default: "gm-player"
  });

  game.settings.register(MOD_ID, "npcAudience", {
    name: "NPC Message Audience",
    hint: "Determines which users receive chat messages for changes to NPC actors.",
    scope: "world", config: true, type: String,
    choices: { "gm": "GM only", "gm-players": "GM + all players", "gm-owners": "GM + owners (default)" },
    default: "gm-owners"
  });

  game.settings.register(MOD_ID, "trackCurrency", {
    name: "Track Currency",
    hint: "If enabled, the module will monitor and log changes to actor currency.",
    scope: "world", config: true, type: Boolean, default: true
  });

  game.settings.register(MOD_ID, "trackItemChanges", {
    name: "Track Item Changes",
    hint: "If enabled, the module will monitor and log changes to items.",
    scope: "world", config: true, type: Boolean, default: true
  });

  game.settings.register(MOD_ID, "trackDeletedMessages", {
    name: "Track Deleted Chat Messages",
    hint: "If enabled, when a player deletes a chat message, a copy of it is whispered to the GM(s).",
    scope: "world", config: true, type: Boolean, default: true
  });

  game.settings.register(MOD_ID, "trackEquipUnequip", {
    name: "Track Equip / Unequip",
    hint: "If enabled, the module will log when items are equipped or unequipped on an actor.",
    scope: "world", config: true, type: Boolean, default: false
  });

  game.settings.register(MOD_ID, "trackActiveEffects", {
    name: "Track Active Effects",
    hint: "If enabled, the module will log when Active Effects are added, removed, enabled, or disabled on an actor.",
    scope: "world", config: true, type: Boolean, default: false
  });

  // Delegate system specific settings
  adapter.registerSettings();

  game.settings.registerMenu(MOD_ID, "customTrackedResourcesMenu", {
    name: "Custom Tracked Values",
    label: "Configure",
    hint: "Configure custom actor data paths to track (e.g. Wounds, Fatigue) along with their messages, colors, and icons.",
    icon: "fas fa-cogs",
    type: CustomTrackerConfig,
    restricted: true
  });

  game.settings.register(MOD_ID, "customTrackedResources", {
    name: "Custom Tracked Resources",
    hint: "Internal setting for storing custom tracked resources.",
    scope: "world",
    config: false,
    type: String,
    default: "[]",
    onChange: () => clearCustomResourcesCache()
  });

  game.settings.register(MOD_ID, "autoDetectPaths", {
    name: "Auto-Detect HP Paths",
    hint: "If enabled, the module attempts to automatically determine the correct data paths for HP and other attributes based on the active system. Disable this to manually configure paths below.",
    scope: "world", config: true, type: Boolean, default: true
  });

  game.settings.register(MOD_ID, "hpPath", {
    name: "HP Value Path",
    hint: "Manual System Data Path for HP Value.",
    scope: "world", config: true, type: String, default: ""
  });

  game.settings.register(MOD_ID, "tempHpPath", {
    name: "Temp HP Path",
    hint: "Manual System Data Path for Temporary HP.",
    scope: "world", config: true, type: String, default: ""
  });

  game.settings.register(MOD_ID, "tempHpMaxPath", {
    name: "Temp HP Max Path",
    hint: "Manual System Data Path for Temporary HP Max.",
    scope: "world", config: true, type: String, default: ""
  });

  game.settings.register(MOD_ID, "currencyBasePath", {
    name: "Currency Base Path (Adv)",
    hint: "Manual System Data Path for Currency. Use this to override the default detection if needed.",
    scope: "world", config: true, type: String, default: ""
  });

  const renderHook = game.release.generation >= 14 ? "renderChatMessageHTML" : "renderChatMessage";
  Hooks.on(renderHook, applyMonitorStyling);

  console.log(`[${MOD_ID}] Initialized.`);
});

Hooks.once("ready", () => {
  const sample = game.actors?.contents?.[0];
  if (sample) resolvePaths(sample);
});

// -------------------------------
// Actor Updates (Pre-Update Stash)
// -------------------------------

Hooks.on("preUpdateActor", (actor, update, options, userId) => {
  const { hpPath, tempPath, tempMaxPath } = resolvePaths(actor);

  const willHP = willUpdatePath(update, hpPath);
  const willTHP = willUpdatePath(update, tempPath);
  const willTHPMax = willUpdatePath(update, tempMaxPath);

  let currencyPayload = null;
  if (getWorldBool("trackCurrency", true)) {
    const currencyInfo = adapter.getCurrencyInfo(actor, getWorldPath("currencyBasePath"));
    if (currencyInfo.isFlatCurrency) {
      if (currencyInfo.coins.some(p => willUpdatePath(update, p))) {
        currencyPayload = { ...currencyInfo };
      }
    } else if (currencyInfo.basePath && currencyInfo.coins.length) {
      if (willUpdatePath(update, currencyInfo.basePath) || currencyInfo.coins.some(k => willUpdatePath(update, `${currencyInfo.basePath}.${k}`))) {
        currencyPayload = { ...currencyInfo };
      }
    }
  }

  // System Specific
  const context = { getWorldBool, willUpdatePath, readRaw, readNumber };
  const systemPayload = adapter.buildPreUpdatePayload(actor, update, context);

  // Custom Tracked Values
  let customPayload = null;
  const customResources = getCustomResources();
  if (customResources.length > 0) {
    const changedCustom = [];
    for (const res of customResources) {
      if (willUpdatePath(update, res.path)) {
        changedCustom.push({
          ...res,
          oldValue: readNumber(actor, res.path)
        });
      }
    }
    if (changedCustom.length > 0) {
      customPayload = changedCustom;
    }
  }

  if (!willHP && !willTHP && !willTHPMax && !currencyPayload && !systemPayload && !customPayload) return;

  options[MOD_ID] = {
    oldHP: willHP ? readNumber(actor, hpPath) : undefined,
    oldTHP: willTHP ? readNumber(actor, tempPath) : undefined,
    oldTHPMax: willTHPMax ? readNumber(actor, tempMaxPath) : undefined,
    currency: currencyPayload ? { ...currencyPayload, old: currencyPayload.isFlatCurrency
      ? Object.fromEntries(currencyPayload.coins.map(p => [p, readNumber(actor, p)]))
      : Object.fromEntries(currencyPayload.coins.map(k => [k, readNumber(actor, `${currencyPayload.basePath}.${k}`)]))
    } : undefined,
    system: systemPayload,
    custom: customPayload
  };
});

// -------------------------------
// Actor Updates (Debounced Processing)
// -------------------------------

Hooks.on("updateActor", (actor, update, options, userId) => {
  if (userId !== game.userId || !options?.[MOD_ID]) return;
  const payload = options[MOD_ID];
  const uuid = actor.uuid;

  const pending = ACTOR_DEBOUNCE.get(uuid) ?? {
    oldHP: undefined,
    oldTHP: undefined,
    oldTHPMax: undefined,
    currencyOld: {},
    system: {},
    custom: [],
    timer: null
  };

  if (pending.timer) clearTimeout(pending.timer);

  if (pending.oldHP === undefined) pending.oldHP = payload.oldHP;
  if (pending.oldTHP === undefined) pending.oldTHP = payload.oldTHP;
  if (pending.oldTHPMax === undefined) pending.oldTHPMax = payload.oldTHPMax;

  if (payload.currency) {
    pending.currencyBase = payload.currency.basePath;
    pending.currencyCoins = payload.currency.coins;
    pending.isFlatCurrency = payload.currency.isFlatCurrency ?? false;
    for (const k of payload.currency.coins) {
      if (pending.currencyOld[k] === undefined && payload.currency.old[k] !== undefined) {
        pending.currencyOld[k] = payload.currency.old[k];
      }
    }
  }

  if (payload.system) {
    // Merge system payload. It can be deep, so merge objects loosely.
    for (const [k, v] of Object.entries(payload.system)) {
      if (pending.system[k] === undefined) {
        pending.system[k] = v;
      } else if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
        // Simple shallow merge for nested objects like deathSaves
        pending.system[k] = { ...v, ...pending.system[k] };
      }
    }
  }

  if (payload.custom) {
    pending.custom = pending.custom || [];
    for (const c of payload.custom) {
      const existing = pending.custom.find(x => x.path === c.path);
      if (!existing) {
        pending.custom.push(c);
      } else if (existing.oldValue === undefined) {
        existing.oldValue = c.oldValue;
      }
    }
  }

  pending.timer = setTimeout(() => {
    processActorUpdate(actor, pending);
    ACTOR_DEBOUNCE.delete(uuid);
  }, DEBOUNCE_MS);

  ACTOR_DEBOUNCE.set(uuid, pending);
});

async function processActorUpdate(actor, data) {
  const { hpPath, tempPath, tempMaxPath, damageSystem } = resolvePaths(actor);
  const link = getActorLink(actor);
  const messagesToCreate = [];

  const addMsg = (line, cls, kind, isMultiline = false, customColor = null) => {
    messagesToCreate.push(buildMonitorMessageData(actor, line, cls, kind, isMultiline, customColor));
  };

  // HP
  if (data.oldHP !== undefined && hpPath) {
    const newHP = readNumber(actor, hpPath);
    const delta = newHP - data.oldHP;
    if (delta !== 0) {
      const cls = (damageSystem ? delta < 0 : delta > 0) ? "tiny-monitor-gain" : "tiny-monitor-loss";
      const icon = `<i class="fa-solid fa-heart"></i>`;
      const sign = delta > 0 ? "+" : "-";
      const abs = Math.abs(delta);
      const isSimple = getWorldBool("simpleOutput");

      const text = isSimple
        ? `${damageSystem ? "Damage" : "HP"}: ${sign} ${abs}`
        : `${damageSystem ? "Damage" : "HP"}: ${data.oldHP} ${sign} ${abs} → ${newHP}`;

      const line = `${icon} <span class="tm-actor">${link}</span> <span class="tm-text">${text}</span>`;
      addMsg(line, cls, "hp");
    }
  }

  // Temp HP
  if (data.oldTHP !== undefined && tempPath) {
    const newTHP = readNumber(actor, tempPath);
    const delta = newTHP - data.oldTHP;
    if (delta !== 0) {
      const icon = `<i class="fa-solid fa-shield-halved"></i>`;
      const sign = delta > 0 ? "+" : "-";
      const abs = Math.abs(delta);
      const isSimple = getWorldBool("simpleOutput");

      const text = isSimple
        ? `Temp: ${sign} ${abs}`
        : `Temp: ${data.oldTHP} ${sign} ${abs} → ${newTHP}`;

      const line = `${icon} <span class="tm-actor">${link}</span> <span class="tm-text">${text}</span>`;
      addMsg(line, "tiny-monitor-temp", "temp");
    }
  }

  // Temp Max HP
  if (data.oldTHPMax !== undefined && tempMaxPath) {
    const newTHPMax = readNumber(actor, tempMaxPath);
    const delta = newTHPMax - data.oldTHPMax;
    if (delta !== 0) {
      const icon = `<i class="fa-solid fa-circle-plus"></i>`;
      const sign = delta > 0 ? "+" : "-";
      const abs = Math.abs(delta);
      const isSimple = getWorldBool("simpleOutput");

      const text = isSimple
        ? `Temp Max: ${sign} ${abs}`
        : `Temp Max: ${data.oldTHPMax} ${sign} ${abs} → ${newTHPMax}`;

      const line = `${icon} <span class="tm-actor">${link}</span> <span class="tm-text">${text}</span>`;
      addMsg(line, "tiny-monitor-tempmax", "tempmax");
    }
  }

  // Currency
  if (data.isFlatCurrency && data.currencyCoins) {
    for (const coinPath of data.currencyCoins) {
      const oldVal = data.currencyOld[coinPath] ?? 0;
      const newVal = readNumber(actor, coinPath);
      const delta = newVal - oldVal;
      if (delta !== 0) {
        const icon = `<i class="fa-solid fa-coins"></i>`;
        const sign = delta > 0 ? "+" : "-";
        const abs = Math.abs(delta);
        const name = adapter.getCoinLabel(coinPath);
        const isSimple = getWorldBool("simpleOutput");

        const text = isSimple
          ? `${name}: ${sign} ${abs}`
          : `${name}: ${oldVal} ${sign} ${abs} → ${newVal}`;

        const line = `${icon} <span class="tm-actor">${link}</span> <span class="tm-text">${text}</span>`;
        const cls = delta > 0 ? "tiny-monitor-currency-gain" : "tiny-monitor-currency-loss";
        addMsg(line, cls, "currency");
      }
    }
  } else if (data.currencyBase) {
    for (const k of data.currencyCoins) {
      const oldVal = data.currencyOld[k] ?? 0;
      const newVal = readNumber(actor, `${data.currencyBase}.${k}`);
      const delta = newVal - oldVal;
      if (delta !== 0) {
        const icon = `<i class="fa-solid fa-coins"></i>`;
        const sign = delta > 0 ? "+" : "-";
        const abs = Math.abs(delta);
        const name = adapter.getCoinLabel(k);
        const isSimple = getWorldBool("simpleOutput");

        const text = isSimple
          ? `${name}: ${sign} ${abs}`
          : `${name}: ${oldVal} ${sign} ${abs} → ${newVal}`;

        const line = `${icon} <span class="tm-actor">${link}</span> <span class="tm-text">${text}</span>`;
        const cls = delta > 0 ? "tiny-monitor-currency-gain" : "tiny-monitor-currency-loss";
        addMsg(line, cls, "currency");
      }
    }
  }

  // System Specific Processing
  if (Object.keys(data.system).length > 0) {
    const postAdapterMsg = async (act, line, cls, kind, isMultiline = false, customColor = null) => {
      messagesToCreate.push(buildMonitorMessageData(act, line, cls, kind, isMultiline, customColor));
    };
    const context = { link, postMonitorMessage: postAdapterMsg, readRaw, readNumber, getWorldBool };
    await adapter.processActorUpdate(actor, data.system, context);
  }

  // Custom Tracked Resources
  if (data.custom && data.custom.length > 0) {
    for (const res of data.custom) {
      if (res.oldValue !== undefined) {
        const newVal = readNumber(actor, res.path);
        const delta = newVal - res.oldValue;
        if (delta !== 0) {
          const isGain = delta > 0;
          const sign = isGain ? "+" : "-";
          const abs = Math.abs(delta);
          const isSimple = getWorldBool("simpleOutput");
          
          let actionMsg = isGain ? res.msgGain : res.msgLoss;
          actionMsg = actionMsg.replace(/{name}/g, res.name).replace(/{old}/g, res.oldValue).replace(/{new}/g, newVal).replace(/{diff}/g, String(abs));
          
          const text = isSimple
            ? `${res.name}: ${sign} ${abs}`
            : `${actionMsg} (${res.oldValue} ${sign} ${abs} → ${newVal})`;

          const iconHtml = (res.icon.includes('/') || res.icon.includes('.')) 
            ? `<img src="${res.icon}" style="width: 14px; height: 14px; border: none; align-self: center;" />`
            : `<i class="${res.icon}"></i>`;

          const line = `${iconHtml} <span class="tm-actor">${link}</span> <span class="tm-text">${text}</span>`;
          addMsg(line, "tiny-monitor-custom", "custom", false, res.color);
        }
      }
    }
  }

  if (messagesToCreate.length > 0) {
    if (messagesToCreate.length === 1) {
      await ChatMessage.create(messagesToCreate[0]);
    } else {
      await ChatMessage.createDocuments(messagesToCreate);
    }
  }
}

// -------------------------------
// Item Updates (Debounced)
// -------------------------------

Hooks.on("createItem", async (item, options, userId) => {
  if (userId !== game.userId || !getWorldBool("trackItemChanges")) return;
  if (!(item.parent instanceof Actor)) return;

  const qty = readNumber(item, "system.quantity") || 1;
  const link = getActorLink(item.parent);
  const safeItemName = escapeHTML(item.name);
  const icon = `<i class="fa-solid fa-backpack"></i>`;

  const isSimple = getWorldBool("simpleOutput");

  let line;
  if (qty === 1 || isSimple) {
    line = `${icon} ${link} added ${safeItemName}${qty > 1 ? ` (+${qty})` : ""}`;
  } else {
    line = `${icon} ${link} (${safeItemName}): 0 + ${qty} → ${qty}`;
  }

  await postMonitorMessage(item.parent, line, "tiny-monitor-item-inc", "item", true);
});

Hooks.on("preUpdateItem", (item, change, options, userId) => {
  if (!(item.parent instanceof Actor)) return;
  const trackItems = getWorldBool("trackItemChanges");
  const willQty = trackItems && willUpdatePath(change, "system.quantity");
  const willName = trackItems && willUpdatePath(change, "name");
  const willUses = trackItems && willUpdatePath(change, "system.uses.spent") && readNumber(item, "system.uses.max") > 0;
  const willEquip = getWorldBool("trackEquipUnequip") && willUpdatePath(change, "system.equipped");

  const context = { getWorldBool, willUpdatePath, readRaw, readNumber };
  let systemStash = null;
  if (adapter && adapter.buildPreUpdateItemPayload) {
    systemStash = adapter.buildPreUpdateItemPayload(item, change, context);
  }

  if (willQty || willName || willUses || willEquip || systemStash) {
    ITEM_UPDATE_STASH.set(item, {
      oldQty: willQty ? (readNumber(item, "system.quantity") || 0) : undefined,
      oldName: willName ? String(item.name ?? "") : undefined,
      oldUses: willUses ? readNumber(item, "system.uses.max") - readNumber(item, "system.uses.spent") : undefined,
      oldEquip: willEquip ? Boolean(readRaw(item, "system.equipped")) : undefined,
      system: systemStash
    });
  }
});

Hooks.on("updateItem", (item, change, options, userId) => {
  if (userId !== game.userId || !(item.parent instanceof Actor)) return;

  const stash = ITEM_UPDATE_STASH.get(item);
  ITEM_UPDATE_STASH.delete(item);

  if (stash || adapter) {
    const uuid = item.uuid;
    const pending = ITEM_DEBOUNCE.get(uuid) ?? { oldQty: undefined, oldName: undefined, oldUses: undefined, oldEquip: undefined, system: {}, timer: null };

    if (pending.timer) clearTimeout(pending.timer);

    if (stash) {
      if (pending.oldQty === undefined && stash.oldQty !== undefined) pending.oldQty = stash.oldQty;
      if (pending.oldName === undefined && stash.oldName !== undefined) pending.oldName = stash.oldName;
      if (pending.oldUses === undefined && stash.oldUses !== undefined) pending.oldUses = stash.oldUses;
      if (pending.oldEquip === undefined && stash.oldEquip !== undefined) pending.oldEquip = stash.oldEquip;
      
      if (stash.system) {
        for (const [k, v] of Object.entries(stash.system)) {
          if (pending.system[k] === undefined) {
            pending.system[k] = v;
          } else if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
            pending.system[k] = { ...v, ...pending.system[k] };
          }
        }
      }
    }

    pending.timer = setTimeout(async () => {
      let handled = false;
      if (adapter) {
         const context = { getWorldBool, postMonitorMessage, readRaw, getActorLink, escapeHTML, oldItemData: pending };
         handled = await adapter.processItemChange(item, "update", context);
      }
      
      if (!handled) {
         await processItemUpdate(item, pending);
      }
      ITEM_DEBOUNCE.delete(uuid);
    }, DEBOUNCE_MS);

    ITEM_DEBOUNCE.set(uuid, pending);
  }
});

async function processItemUpdate(item, data) {
  if (!item.parent) return;

  const link = getActorLink(item.parent);
  const icon = `<i class="fa-solid fa-backpack"></i>`;

  // Quantity
  if (data.oldQty !== undefined) {
    const oldQty = data.oldQty;
    const newQty = readNumber(item, "system.quantity") || 0;

    if (newQty !== oldQty) {
      const safeItemName = escapeHTML(item.name);

      const delta = newQty - oldQty;
      const sign = delta > 0 ? "+" : "-";
      const abs = Math.abs(delta);
      const isSimple = getWorldBool("simpleOutput");

      if (oldQty === 0 && newQty === 1) {
        await postMonitorMessage(item.parent, `${icon} ${link} added ${safeItemName}`, "tiny-monitor-item-inc", "item", true);
      }
      else if (oldQty === 1 && newQty === 0) {
        await postMonitorMessage(item.parent, `${icon} ${link} deleted ${safeItemName}`, "tiny-monitor-item-dec", "item", true);
      }
      else {
        const text = isSimple
          ? `${sign} ${abs}`
          : `${oldQty} ${sign} ${abs} → ${newQty}`;

        const line = `${icon} ${link} ${safeItemName}: ${text}`;
        await postMonitorMessage(item.parent, line, delta > 0 ? "tiny-monitor-item-inc" : "tiny-monitor-item-dec", "item", true);
      }
    }
  }

  // Limited Uses
  if (data.oldUses !== undefined) {
    const max = readNumber(item, "system.uses.max");
    const newUses = max - readNumber(item, "system.uses.spent");
    const delta = newUses - data.oldUses;

    if (delta !== 0 && max > 0) {
      const usesIcon = `<i class="fa-solid fa-battery-half"></i>`;
      const safeItemName = escapeHTML(item.name);
      const sign = delta > 0 ? "+" : "-";
      const abs = Math.abs(delta);
      const isSimple = getWorldBool("simpleOutput");
      const text = isSimple
        ? `Uses: ${sign} ${abs}`
        : `Uses: ${data.oldUses} ${sign} ${abs} → ${newUses} / ${max}`;
      const cls = delta > 0 ? "tiny-monitor-item-inc" : "tiny-monitor-item-dec";
      const line = `${usesIcon} ${link} ${safeItemName}: ${text}`;
      await postMonitorMessage(item.parent, line, cls, "item-uses", true);
    }
  }

  // Rename
  if (data.oldName !== undefined && item.name !== data.oldName) {
    const line = `${icon} ${link} ${data.oldName} → ${item.name}`;
    await postMonitorMessage(item.parent, line, "tiny-monitor-item", "item", true);
  }

  // Equip / Unequip
  if (data.oldEquip !== undefined) {
    const newEquip = Boolean(readRaw(item, "system.equipped"));
    if (newEquip !== data.oldEquip) {
      const safeItemName = escapeHTML(item.name);
      const equipIcon = `<i class="fa-solid fa-shirt"></i>`;
      const action = newEquip ? "equipped" : "unequipped";
      const cls = newEquip ? "tiny-monitor-equip" : "tiny-monitor-unequip";
      const line = `${equipIcon} ${link} ${action} ${safeItemName}`;
      await postMonitorMessage(item.parent, line, cls, "equip", true);
    }
  }
}

// -------------------------------
// Delete Item (No Debounce necessary)
// -------------------------------

Hooks.on("preDeleteItem", (item, options, userId) => {
  if (!getWorldBool("trackItemChanges")) return;
  if (!(item.parent instanceof Actor)) return;

  ITEM_DELETE_STASH.set(item, {
    link: getActorLink(item.parent),
    whisper: buildRecipients(item.parent),
    name: item.name,
    qty: readNumber(item, "system.quantity"),
    hasQty: foundry.utils.hasProperty(item, "system.quantity")
  });
});

Hooks.on("deleteItem", async (item, options, userId) => {
  if (userId !== game.userId || !getWorldBool("trackItemChanges")) return;
  const payload = ITEM_DELETE_STASH.get(item);
  ITEM_DELETE_STASH.delete(item);
  if (!payload) return;

  const { hasQty, qty, link, whisper, name } = payload;
  const oldQty = Number(qty ?? 0);

  if (hasQty && oldQty === 0) return;

  const treatAsSingleton = !hasQty || oldQty <= 1;
  const icon = `<i class="fa-solid fa-backpack"></i>`;

  const line = (treatAsSingleton || getWorldBool("simpleOutput"))
    ? `${icon} ${link} deleted ${name}`
    : `${icon} ${link} ${name}: ${oldQty} - ${oldQty} → 0`;

  const msgData = {
    content: `<div class="tiny-monitor-line tm-multiline">${line}</div>`,
    flags: { [MOD_ID]: { isMonitorMsg: true, kind: "item", cls: "tiny-monitor-item-dec" } }
  };
  if (whisper.length > 0) msgData.whisper = whisper;
  await ChatMessage.create(msgData);
});

// -------------------------------
// Active Effect Tracking
// -------------------------------

function resolveEffectActor(effect) {
  if (effect.actor instanceof Actor) return effect.actor;
  if (effect.parent instanceof Actor) return effect.parent;
  if (effect.parent?.actor instanceof Actor) return effect.parent.actor;
  if (effect.parent?.parent instanceof Actor) return effect.parent.parent;
  return null;
}

Hooks.on("createActiveEffect", async (effect, options, userId) => {
  if (userId !== game.userId || !getWorldBool("trackActiveEffects")) return;
  const actor = resolveEffectActor(effect);
  if (!actor) return;

  const link = getActorLink(actor);
  const safeEffName = escapeHTML(effect.name || "Unknown Effect");
  const icon = `<i class="fa-solid fa-sparkles"></i>`;
  const line = `${icon} ${link} gained effect: ${safeEffName}`;
  await postMonitorMessage(actor, line, "tiny-monitor-effect-add", "effect", true);
});

Hooks.on("preDeleteActiveEffect", (effect, options, userId) => {
  if (!getWorldBool("trackActiveEffects")) return;
  const actor = resolveEffectActor(effect);
  if (!actor) return;

  EFFECT_DELETE_STASH.set(effect, {
    link: getActorLink(actor),
    whisper: buildRecipients(actor),
    name: effect.name || "Unknown Effect",
    actor
  });
});

Hooks.on("deleteActiveEffect", async (effect, options, userId) => {
  if (userId !== game.userId || !getWorldBool("trackActiveEffects")) return;
  const payload = EFFECT_DELETE_STASH.get(effect);
  EFFECT_DELETE_STASH.delete(effect);
  if (!payload) return;

  const safeEffName = escapeHTML(payload.name);
  const icon = `<i class="fa-solid fa-sparkles"></i>`;
  const line = `${icon} ${payload.link} lost effect: ${safeEffName}`;

  const effectMsgData = {
    content: `<div class="tiny-monitor-line tm-multiline">${line}</div>`,
    flags: { [MOD_ID]: { isMonitorMsg: true, kind: "effect", cls: "tiny-monitor-effect-remove" } }
  };
  if (payload.whisper.length > 0) effectMsgData.whisper = payload.whisper;
  await ChatMessage.create(effectMsgData);
});

Hooks.on("updateActiveEffect", async (effect, change, options, userId) => {
  if (userId !== game.userId || !getWorldBool("trackActiveEffects")) return;
  if (!foundry.utils.hasProperty(change, "disabled")) return;

  const actor = resolveEffectActor(effect);
  if (!actor) return;

  const newDisabled = Boolean(effect.disabled);
  const link = getActorLink(actor);
  const safeEffName = escapeHTML(effect.name || "Unknown Effect");
  const icon = `<i class="fa-solid fa-sparkles"></i>`;
  const action = newDisabled ? "disabled" : "enabled";
  const cls = newDisabled ? "tiny-monitor-effect-disable" : "tiny-monitor-effect-enable";
  const line = `${icon} ${link} ${action} effect: ${safeEffName}`;
  await postMonitorMessage(actor, line, cls, "effect", true);
});

function applyMonitorStyling(message, html) {
  if (!message.getFlag(MOD_ID, "isMonitorMsg")) return;
  const li = html instanceof HTMLElement
    ? html.closest(".chat-message") ?? html
    : (html[0]?.closest?.(".chat-message") ?? html);
  if (!li?.classList) return;

  li.classList.add("tiny-monitor-msg");
  const cls = message.getFlag(MOD_ID, "cls");
  if (cls) li.classList.add(cls);
  
  const customColor = message.getFlag(MOD_ID, "customColor");
  if (customColor) {
    li.style.backgroundColor = customColor;
  }

  if (getWorldBool("compactMessages", true)) li.classList.add("tm-compact");
}

// -------------------------------
// Chat Message Deletions
// -------------------------------

Hooks.on("deleteChatMessage", async (message, options, userId) => {
  const primaryGM = game.users.primaryGM ?? game.users.activeGM;
  if (!game.user.isGM || primaryGM?.id !== game.user.id) return;

  const deletingUser = game.users.get(userId);
  if (!deletingUser || deletingUser.isGM) return;

  if (!getWorldBool("trackDeletedMessages", true)) return;

  const gmUsers = game.users.filter(u => u.isGM).map(u => u.id);
  if (gmUsers.length === 0) return;

  const userName = escapeHTML(deletingUser.name || "Unknown Player");
  const messageData = message.toObject();
  
  delete messageData._id;

  messageData.author = game.user.id;
  messageData.user = game.user.id;
  messageData.whisper = gmUsers;
  
  foundry.utils.setProperty(messageData, `flags.${MOD_ID}.isMonitorMsg`, true);
  foundry.utils.setProperty(messageData, `flags.${MOD_ID}.kind`, "chat-delete");
  foundry.utils.setProperty(messageData, `flags.${MOD_ID}.cls`, "tiny-monitor-item-dec");

  const prefix = `<div style="color: var(--color-text-dark-primary); margin-bottom: 0.5rem; font-size: 1.1em;"><strong>${userName} deleted:</strong></div>`;
  if (messageData.flavor) {
    messageData.flavor = prefix + messageData.flavor;
  } else {
    messageData.content = prefix + (messageData.content || "");
  }

  await ChatMessage.create(messageData);
});