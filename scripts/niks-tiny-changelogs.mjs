// Nik's Tiny Change Logs for Foundry VTT
// Posts one-line chat messages for actor, item and effect changes.
// Multi-system (auto-detect + configurable paths) with System Adapters.

import SystemManager from "./systems/index.mjs";
import CustomTrackerConfig from "./custom-tracker-config.mjs";
import SettingsImportExportApp from "./settings-import-export.mjs";
import { parseCustomResources } from "./custom-resources.mjs";

const MOD_ID = "niks-tiny-changelogs";
const MAX_NAME_CHARS = 25;
const DEBOUNCE_MS = 350;
const MESSAGE_FLUSH_MS = 100;

let adapter;

// -------------------------------
// State & Storage
// -------------------------------
const ITEM_DELETE_STASH = new WeakMap();
const ITEM_WATCHED_ROOTS = new Set(["system", "name"]);
const EFFECT_DELETE_STASH = new WeakMap();

// Debounce Maps: Key = Document UUID
const ACTOR_DEBOUNCE = new Map();
const ITEM_DEBOUNCE = new Map();

// Outgoing chat messages, flushed in a single createDocuments call
const MESSAGE_QUEUE = [];
let messageFlushTimer = null;

// -------------------------------
// Utilities
// -------------------------------

// Cached world setting values. game.settings.get scans every world Setting document
// (and constructs a new Setting when the value was never saved), so reads are cached
// and invalidated through the Setting document hooks.
const SETTINGS_CACHE = new Map();

let cachedCustomResources = null;
let cachedActiveCustomResources = null;
let cachedNameBlacklist = null;
let cachedWatchedActorRoots = null;

/** Clear the settings cache and every cache derived from setting values. */
function onSettingDocumentChange(setting) {
  if (!setting?.key?.startsWith(`${MOD_ID}.`)) return;
  SETTINGS_CACHE.clear();
  cachedCustomResources = null;
  cachedActiveCustomResources = null;
  cachedNameBlacklist = null;
  cachedWatchedActorRoots = null;
}

Hooks.on("createSetting", onSettingDocumentChange);
Hooks.on("updateSetting", onSettingDocumentChange);
Hooks.on("deleteSetting", onSettingDocumentChange);

function getSetting(key, def) {
  if (SETTINGS_CACHE.has(key)) return SETTINGS_CACHE.get(key);
  try {
    const value = game.settings.get(MOD_ID, key);
    SETTINGS_CACHE.set(key, value);
    return value;
  } catch {
    return def;
  }
}

function getCustomResources() {
  cachedCustomResources ??= parseCustomResources(getSetting("customTrackedResources", "[]"));
  return cachedCustomResources;
}

/** Custom resources with a valid path whose name is not blacklisted. */
function getActiveCustomResources() {
  cachedActiveCustomResources ??= getCustomResources().filter(res => res.path && !isNameBlacklisted(res.name));
  return cachedActiveCustomResources;
}

// One blacklist entry: a /regex/flags token (which may contain commas) or plain text up to the next separator
const BLACKLIST_TOKEN = /\s*(\/(?:\\.|[^/\\\n])+\/[a-z]*)(?=\s*(?:[,\n]|$))|[^,\n]+/g;

function getNameBlacklist() {
  if (cachedNameBlacklist !== null) return cachedNameBlacklist;
  cachedNameBlacklist = { exact: new Set(), patterns: [] };

  const raw = getSetting("nameBlacklist", "");
  if (!raw || typeof raw !== "string" || !raw.trim()) return cachedNameBlacklist;

  const entries = [...raw.matchAll(BLACKLIST_TOKEN)]
    .map(m => (m[1] ?? m[0]).trim())
    .filter(s => s.length > 0);

  for (const entry of entries) {
    // Regex pattern: /.../flags
    if (entry.startsWith("/") && entry.lastIndexOf("/") > 0) {
      const lastSlash = entry.lastIndexOf("/");
      const pattern = entry.slice(1, lastSlash);
      const flags = entry.slice(lastSlash + 1);
      try {
        cachedNameBlacklist.patterns.push(new RegExp(pattern, flags));
        continue;
      } catch (e) {
        console.warn(`[${MOD_ID}] Invalid regex in name blacklist: "${entry}"`, e);
      }
    }

    // Wildcard pattern: contains * or ?
    if (entry.includes("*") || entry.includes("?")) {
      const escaped = entry
        .replace(/[-\/\\^$+.()|[\]{}]/g, "\\$&")
        .replace(/\*/g, ".*")
        .replace(/\?/g, ".");
      cachedNameBlacklist.patterns.push(new RegExp(`^${escaped}$`, "i"));
      continue;
    }

    // Exact string match (case-insensitive)
    cachedNameBlacklist.exact.add(entry.toLowerCase());
  }

  return cachedNameBlacklist;
}

export function isNameBlacklisted(name) {
  if (!name) return false;
  const { exact, patterns } = getNameBlacklist();
  if (!exact.size && !patterns.length) return false;
  const str = String(name).trim();
  if (exact.has(str.toLowerCase())) return true;
  return patterns.some(re => {
    // Global/sticky regexes keep state between test() calls
    re.lastIndex = 0;
    return re.test(str);
  });
}

/** Top-level update keys that can affect anything tracked on an actor. */
function getWatchedActorRoots() {
  if (cachedWatchedActorRoots !== null) return cachedWatchedActorRoots;
  const paths = [
    getWorldPath("hpPath"),
    getWorldPath("tempHpPath"),
    getWorldPath("tempHpMaxPath"),
    getWorldPath("currencyBasePath"),
    ...getCustomResources().map(res => res.path)
  ];
  cachedWatchedActorRoots = new Set(["system"]);
  for (const path of paths) {
    if (typeof path === "string" && path.trim()) cachedWatchedActorRoots.add(path.trim().split(".")[0]);
  }
  return cachedWatchedActorRoots;
}

function updateTouchesRoots(update, roots) {
  for (const key of Object.keys(update ?? {})) {
    // Tolerate legacy "-=" / "==" operator prefixes
    if (roots.has(key.split(".")[0].replace(/^(-=|==)/, ""))) return true;
  }
  return false;
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
  // Braces would end the @UUID label early; HTML in names must stay text
  const label = escapeHTML(clipName(rawName).replace(/{/g, "(").replace(/}/g, ")"));
  return `@UUID[${actor?.uuid ?? ""}]{${label}}`;
}

function getWorldBool(key, def = false) {
  return Boolean(getSetting(key, def));
}

function getWorldPath(key) {
  const v = getSetting(key, null);
  return (typeof v === "string" && v.trim().length) ? v.trim() : null;
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
  const gmIds = game.users.filter(u => u.isGM).map(u => u.id);
  const visibility = getSetting("messageVisibility", "gm-player") ?? "gm-player";

  if (visibility === "gm") {
    // GM only: whispered exclusively to GMs
    return gmIds;
  }

  if (visibility === "player") {
    // Player only: whispered to all non-GM players; GMs won't see it
    const nonGmIds = game.users.filter(u => !u.isGM).map(u => u.id);
    return nonGmIds.length > 0 ? nonGmIds : gmIds;
  }

  // GM + owning players
  const gmAndOwners = () => {
    const ids = new Set(gmIds);
    if (actor.testUserPermission) {
      for (const u of game.users) {
        if (!u.isGM && actor.testUserPermission(u, CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER)) ids.add(u.id);
      }
    }
    return [...ids];
  };

  // For NPCs, the NPC Message Audience setting further refines the audience.
  if (actor.type === "npc") {
    const npcMode = getSetting("npcAudience", "gm-owners") ?? "gm-owners";
    if (npcMode === "gm") return gmIds;
    if (npcMode === "everyone" || npcMode === "gm-players") return [];
    return gmAndOwners();
  }

  // PC actors:
  // "everyone": public message visible to all players and GMs
  if (visibility === "everyone") {
    return [];
  }

  // "gm-player" (GM + Owners, default): whisper to GM and the player(s) owning the PC actor
  return gmAndOwners();
}

/**
 * Build chat message data for a changelog line.
 * Pass a precomputed `whisper` list to avoid recomputing recipients for every message of a batch.
 */
function buildMonitorMessageData(actor, line, cls, kind, isMultiline = false, customColor = null, whisper = null) {
  whisper ??= buildRecipients(actor);
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

/**
 * Queue chat message data. Messages queued within MESSAGE_FLUSH_MS of the first queued message
 * are created in a single createDocuments call, so bulk changes (level-ups, rests, dragging in
 * many items) cost one server round-trip instead of one per document.
 */
function queueMessages(...msgData) {
  MESSAGE_QUEUE.push(...msgData);
  messageFlushTimer ??= setTimeout(flushMessageQueue, MESSAGE_FLUSH_MS);
}

async function flushMessageQueue() {
  messageFlushTimer = null;
  if (!MESSAGE_QUEUE.length) return;
  const batch = MESSAGE_QUEUE.splice(0, MESSAGE_QUEUE.length);
  try {
    await ChatMessage.createDocuments(batch);
  } catch (err) {
    console.error(`[${MOD_ID}] Failed to create changelog messages:`, err);
  }
}

async function postMonitorMessage(actor, line, cls, kind, isMultiline = false, customColor = null) {
  queueMessages(buildMonitorMessageData(actor, line, cls, kind, isMultiline, customColor));
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

  game.settings.register(MOD_ID, "messageVisibility", {
    name: "Message Visibility",
    hint: "Controls who can see changelog messages. 'GM only' whispers exclusively to GMs. 'GM + Owners' whispers to GMs and the owning player(s) (default). 'Everyone' posts a public message visible to all players and GMs. 'Player only' whispers to all non-GM players. For NPCs, the audience is further refined by the NPC Message Audience setting unless Visibility is set to 'GM only' or 'Player only'.",
    scope: "world", config: true, type: String,
    choices: {
      "gm": "GM only",
      "gm-player": "GM + Owners (default)",
      "everyone": "Everyone",
      "player": "Player only"
    },
    default: "gm-player"
  });

  game.settings.register(MOD_ID, "npcAudience", {
    name: "NPC Message Audience",
    hint: "Controls who can see changelog messages for NPC actors. 'GM only' whispers exclusively to GMs. 'GM + Owners' whispers to GMs and the owning player(s) (default). 'Everyone' posts a public message visible to all players and GMs. Only applies when Message Visibility is set to 'GM + Owners' or 'Everyone'.",
    scope: "world", config: true, type: String,
    choices: {
      "gm": "GM only",
      "gm-owners": "GM + Owners (default)",
      "everyone": "Everyone"
    },
    default: "gm-owners"
  });

  game.settings.register(MOD_ID, "trackCurrency", {
    name: "Track Currency",
    hint: "If enabled, the module will monitor and log changes to actor and container currency.",
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

  game.settings.register(MOD_ID, "protectChangelogMessages", {
    name: "Protect Changelog Messages",
    hint: "If enabled, players cannot delete changelog messages, so changes (e.g. HP gains) cannot be hidden from the GM. GMs can still delete them.",
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

  game.settings.register(MOD_ID, "nameBlacklist", {
    name: "Ignored Names / Blacklist",
    hint: "Comma-separated list of item and Active Effect names to ignore from changelogs (case-insensitive, e.g. 'Aura of Protection, Torch'). Supports wildcards (*) and regex (/pattern/).",
    scope: "world", config: true, type: String, default: ""
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
    default: "[]"
  });

  game.settings.registerMenu(MOD_ID, "importExportMenu", {
    name: "Import / Export Settings",
    label: "Import / Export",
    hint: "Export all module settings and custom tracker configurations to a JSON file, or import settings from a previously exported file.",
    icon: "fas fa-file-import",
    type: SettingsImportExportApp,
    restricted: true
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

  Hooks.on("renderChatMessageHTML", applyMonitorStyling);

  // Core always scrolls to the bottom for messages authored by the current user, which yanks the chat down
  // when someone scrolled up to click a damage button. For our messages, only scroll if already at the bottom.
  const ChatLog = foundry.applications?.sidebar?.tabs?.ChatLog;
  const originalPostOne = ChatLog?.prototype?.postOne;
  if (originalPostOne) {
    ChatLog.prototype.postOne = function (message, options = {}) {
      if (options.scroll === undefined && message?.flags?.[MOD_ID] && !this.isAtBottom) {
        options = { ...options, scroll: false };
      }
      return originalPostOne.call(this, message, options);
    };
  }

  console.log(`[${MOD_ID}] Initialized.`);
});

Hooks.once("ready", () => {
  if (game.user.isGM) {
    if (getSetting("npcAudience") === "gm-players") {
      game.settings.set(MOD_ID, "npcAudience", "everyone");
    }
  }
});

// -------------------------------
// Actor Updates (Pre-Update Stash)
// -------------------------------

Hooks.on("preUpdateActor", (actor, update, options, userId) => {
  // Skip updates that cannot touch anything tracked (e.g. flag-only, name, image or ownership updates)
  if (!updateTouchesRoots(update, getWatchedActorRoots())) return;

  const { hpPath, tempPath, tempMaxPath } = resolvePaths(actor);

  const willHP = willUpdatePath(update, hpPath);
  const willTHP = willUpdatePath(update, tempPath);
  const willTHPMax = willUpdatePath(update, tempMaxPath);

  let currencyPayload = null;
  const currencyBasePath = getWorldPath("currencyBasePath");
  if (getWorldBool("trackCurrency", true) && adapter.updateTouchesCurrency(update, currencyBasePath)) {
    const currencyInfo = adapter.getCurrencyInfo(actor, currencyBasePath);
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
  const context = { getWorldBool, willUpdatePath, readRaw, readNumber, isNameBlacklisted };
  const systemPayload = adapter.buildPreUpdatePayload(actor, update, context);

  // Custom Tracked Values
  let customPayload = null;
  const customResources = getActiveCustomResources();
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

  // Keyed by document ID: one operation can update several actors with shared options
  options[MOD_ID] ??= {};
  options[MOD_ID][actor.id] = {
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
  const payload = options?.[MOD_ID]?.[actor.id];
  if (userId !== game.userId || !payload) return;
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
    ACTOR_DEBOUNCE.delete(uuid);
    processActorUpdate(actor, pending).catch(err => {
      console.error(`[${MOD_ID}] Failed to process actor update:`, err);
    });
  }, DEBOUNCE_MS);

  ACTOR_DEBOUNCE.set(uuid, pending);
});

async function processActorUpdate(actor, data) {
  const { hpPath, tempPath, tempMaxPath, damageSystem, tempMaxLabel = "Temp Max" } = resolvePaths(actor);
  const link = getActorLink(actor);
  const messagesToCreate = [];
  let whisper = null;

  const addMsg = (line, cls, kind, isMultiline = false, customColor = null) => {
    whisper ??= buildRecipients(actor);
    messagesToCreate.push(buildMonitorMessageData(actor, line, cls, kind, isMultiline, customColor, whisper));
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
        ? `${tempMaxLabel}: ${sign} ${abs}`
        : `${tempMaxLabel}: ${data.oldTHPMax} ${sign} ${abs} → ${newTHPMax}`;

      const line = `${icon} <span class="tm-actor">${link}</span> <span class="tm-text">${text}</span>`;
      addMsg(line, "tiny-monitor-tempmax", "tempmax");
    }
  }

  // Currency
  if (data.isFlatCurrency && data.currencyCoins) {
    for (const coinPath of data.currencyCoins) {
      const oldVal = data.currencyOld[coinPath] ?? 0;
      const newVal = readNumber(actor, coinPath);
      const delta = Math.round((newVal - oldVal) * 10000) / 10000;
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
  } else if (data.currencyBase && data.currencyCoins) {
    for (const k of data.currencyCoins) {
      const oldVal = data.currencyOld[k] ?? 0;
      const newVal = readNumber(actor, `${data.currencyBase}.${k}`);
      const delta = Math.round((newVal - oldVal) * 10000) / 10000;
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
      if (act === actor) addMsg(line, cls, kind, isMultiline, customColor);
      else messagesToCreate.push(buildMonitorMessageData(act, line, cls, kind, isMultiline, customColor));
    };
    const context = { link, postMonitorMessage: postAdapterMsg, readRaw, readNumber, getWorldBool, isNameBlacklisted };
    await adapter.processActorUpdate(actor, data.system, context);
  }

  // Custom Tracked Resources
  if (data.custom && data.custom.length > 0) {
    for (const res of data.custom) {
      if (isNameBlacklisted(res.name)) continue;
      if (res.oldValue !== undefined) {
        const newVal = readNumber(actor, res.path);
        const delta = newVal - res.oldValue;
        if (delta !== 0) {
          const isGain = delta > 0;
          const sign = isGain ? "+" : "-";
          const abs = Math.abs(delta);
          const isSimple = getWorldBool("simpleOutput");
          
          // Replacer functions, so "$" sequences in names are not treated as replacement patterns
          const actionMsg = (isGain ? res.msgGain : res.msgLoss)
            .replace(/{name}/g, () => res.name)
            .replace(/{old}/g, () => String(res.oldValue))
            .replace(/{new}/g, () => String(newVal))
            .replace(/{diff}/g, () => String(abs));
          const safeName = escapeHTML(res.name);

          const text = isSimple
            ? `${safeName}: ${sign} ${abs}`
            : `${escapeHTML(actionMsg)} (${res.oldValue} ${sign} ${abs} → ${newVal})`;

          const iconHtml = (res.icon.includes('/') || res.icon.includes('.'))
            ? `<img src="${escapeHTML(res.icon)}" style="width: 14px; height: 14px; border: none; align-self: center;" />`
            : `<i class="${escapeHTML(res.icon)}"></i>`;

          const line = `${iconHtml} <span class="tm-actor">${link}</span> <span class="tm-text">${text}</span>`;
          addMsg(line, "tiny-monitor-custom", "custom", false, res.color);
        }
      }
    }
  }

  if (messagesToCreate.length > 0) queueMessages(...messagesToCreate);
}

// -------------------------------
// Item Updates (Debounced)
// -------------------------------

Hooks.on("createItem", async (item, options, userId) => {
  if (userId !== game.userId || !getWorldBool("trackItemChanges")) return;
  if (!(item.parent instanceof Actor)) return;
  if (isNameBlacklisted(item.name)) return;

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
  // Everything tracked on items lives under `system` or is the name
  if (!updateTouchesRoots(change, ITEM_WATCHED_ROOTS)) return;
  const trackItems = getWorldBool("trackItemChanges");
  const willQty = trackItems && willUpdatePath(change, "system.quantity");
  const willName = trackItems && willUpdatePath(change, "name");
  const willUses = trackItems && willUpdatePath(change, "system.uses.spent") && readNumber(item, "system.uses.max") > 0;
  const willEquip = getWorldBool("trackEquipUnequip") && willUpdatePath(change, "system.equipped");

  let currencyPayload = null;
  const currencyBasePath = getWorldPath("currencyBasePath");
  if (getWorldBool("trackCurrency", true) && adapter.updateTouchesCurrency(change, currencyBasePath)
    && !isNameBlacklisted(item.name)) {
    const currencyInfo = adapter.getItemCurrencyInfo(item, currencyBasePath);
    if (currencyInfo?.isFlatCurrency) {
      if (currencyInfo.coins.some(p => willUpdatePath(change, p))) {
        currencyPayload = { ...currencyInfo };
      }
    } else if (currencyInfo?.basePath && currencyInfo.coins.length) {
      if (willUpdatePath(change, currencyInfo.basePath) || currencyInfo.coins.some(k => willUpdatePath(change, `${currencyInfo.basePath}.${k}`))) {
        currencyPayload = { ...currencyInfo };
      }
    }
  }

  const context = { getWorldBool, willUpdatePath, readRaw, readNumber, isNameBlacklisted };
  const systemStash = adapter.buildPreUpdateItemPayload(item, change, context);

  if (willQty || willName || willUses || willEquip || currencyPayload || systemStash) {
    // Stored on the operation options (keyed by item ID, since one operation can update many items)
    // rather than a module-level map, so a no-op update cannot leave a stale stash behind.
    options[MOD_ID] ??= {};
    options[MOD_ID][item.id] = {
      oldQty: willQty ? (readNumber(item, "system.quantity") || 0) : undefined,
      oldName: willName ? String(item.name ?? "") : undefined,
      oldUses: willUses ? readNumber(item, "system.uses.max") - readNumber(item, "system.uses.spent") : undefined,
      oldEquip: willEquip ? Boolean(readRaw(item, "system.equipped")) : undefined,
      currency: currencyPayload ? {
        ...currencyPayload,
        old: currencyPayload.isFlatCurrency
          ? Object.fromEntries(currencyPayload.coins.map(p => [p, readNumber(item, p)]))
          : Object.fromEntries(currencyPayload.coins.map(k => [k, readNumber(item, `${currencyPayload.basePath}.${k}`)]))
      } : undefined,
      system: systemStash
    };
  }
});

Hooks.on("updateItem", (item, change, options, userId) => {
  if (userId !== game.userId || !(item.parent instanceof Actor)) return;

  const stash = options?.[MOD_ID]?.[item.id];

  if (stash || ITEM_DEBOUNCE.has(item.uuid)) {
    const uuid = item.uuid;
    const pending = ITEM_DEBOUNCE.get(uuid) ?? {
      oldQty: undefined,
      oldName: undefined,
      oldUses: undefined,
      oldEquip: undefined,
      currencyOld: {},
      system: {},
      timer: null
    };

    if (pending.timer) clearTimeout(pending.timer);

    if (stash) {
      if (pending.oldQty === undefined && stash.oldQty !== undefined) pending.oldQty = stash.oldQty;
      if (pending.oldName === undefined && stash.oldName !== undefined) pending.oldName = stash.oldName;
      if (pending.oldUses === undefined && stash.oldUses !== undefined) pending.oldUses = stash.oldUses;
      if (pending.oldEquip === undefined && stash.oldEquip !== undefined) pending.oldEquip = stash.oldEquip;

      if (stash.currency) {
        pending.currencyBase = stash.currency.basePath;
        pending.currencyCoins = stash.currency.coins;
        pending.isFlatCurrency = stash.currency.isFlatCurrency ?? false;
        for (const k of stash.currency.coins) {
          if (pending.currencyOld[k] === undefined && stash.currency.old[k] !== undefined) {
            pending.currencyOld[k] = stash.currency.old[k];
          }
        }
      }

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
      // Remove first, so an error below cannot leave stale old values behind for later updates
      ITEM_DEBOUNCE.delete(uuid);
      try {
        const context = { getWorldBool, postMonitorMessage, readRaw, getActorLink, escapeHTML, oldItemData: pending, isNameBlacklisted };
        await adapter.processItemChange(item, "update", context);
        await processItemUpdate(item, pending);
      } catch (err) {
        console.error(`[${MOD_ID}] Failed to process item update:`, err);
      }
    }, DEBOUNCE_MS);

    ITEM_DEBOUNCE.set(uuid, pending);
  }
});

async function processItemUpdate(item, data) {
  if (!item.parent) return;

  const currentBlacklisted = isNameBlacklisted(item.name);
  const link = getActorLink(item.parent);
  const icon = `<i class="fa-solid fa-backpack"></i>`;
  const safeItemName = escapeHTML(item.name || "Container");
  const messagesToCreate = [];
  let whisper = null;

  const addMsg = (line, cls, kind, isMultiline = false, customColor = null) => {
    whisper ??= buildRecipients(item.parent);
    messagesToCreate.push(buildMonitorMessageData(item.parent, line, cls, kind, isMultiline, customColor, whisper));
  };

  // Quantity
  if (data.oldQty !== undefined && !currentBlacklisted) {
    const oldQty = data.oldQty;
    const newQty = readNumber(item, "system.quantity") || 0;

    if (newQty !== oldQty) {
      const delta = newQty - oldQty;
      const sign = delta > 0 ? "+" : "-";
      const abs = Math.abs(delta);
      const isSimple = getWorldBool("simpleOutput");

      if (oldQty === 0 && newQty === 1) {
        addMsg(`${icon} ${link} added ${safeItemName}`, "tiny-monitor-item-inc", "item", true);
      }
      else if (oldQty === 1 && newQty === 0) {
        addMsg(`${icon} ${link} deleted ${safeItemName}`, "tiny-monitor-item-dec", "item", true);
      }
      else {
        const text = isSimple
          ? `${sign} ${abs}`
          : `${oldQty} ${sign} ${abs} → ${newQty}`;

        const line = `${icon} ${link} ${safeItemName}: ${text}`;
        addMsg(line, delta > 0 ? "tiny-monitor-item-inc" : "tiny-monitor-item-dec", "item", true);
      }
    }
  }

  // Limited Uses
  if (data.oldUses !== undefined && !currentBlacklisted) {
    const max = readNumber(item, "system.uses.max");
    const newUses = max - readNumber(item, "system.uses.spent");
    const delta = newUses - data.oldUses;

    if (delta !== 0 && max > 0) {
      const usesIcon = `<i class="fa-solid fa-battery-half"></i>`;
      const sign = delta > 0 ? "+" : "-";
      const abs = Math.abs(delta);
      const isSimple = getWorldBool("simpleOutput");
      const text = isSimple
        ? `Uses: ${sign} ${abs}`
        : `Uses: ${data.oldUses} ${sign} ${abs} → ${newUses} / ${max}`;
      const cls = delta > 0 ? "tiny-monitor-item-inc" : "tiny-monitor-item-dec";
      const line = `${usesIcon} ${link} ${safeItemName}: ${text}`;
      addMsg(line, cls, "item-uses", true);
    }
  }

  // Rename
  if (data.oldName !== undefined && item.name !== data.oldName) {
    if (!isNameBlacklisted(data.oldName) && !currentBlacklisted) {
      const safeOldName = escapeHTML(data.oldName);
      const line = `${icon} ${link} ${safeOldName} → ${safeItemName}`;
      addMsg(line, "tiny-monitor-item", "item", true);
    }
  }

  // Equip / Unequip
  if (data.oldEquip !== undefined && !currentBlacklisted) {
    const newEquip = Boolean(readRaw(item, "system.equipped"));
    if (newEquip !== data.oldEquip) {
      const equipIcon = `<i class="fa-solid fa-shirt"></i>`;
      const action = newEquip ? "equipped" : "unequipped";
      const cls = newEquip ? "tiny-monitor-equip" : "tiny-monitor-unequip";
      const line = `${equipIcon} ${link} ${action} ${safeItemName}`;
      addMsg(line, cls, "equip", true);
    }
  }

  // Container Currency
  if (!currentBlacklisted) {
    if (data.isFlatCurrency && data.currencyCoins) {
      for (const coinPath of data.currencyCoins) {
        const oldVal = data.currencyOld[coinPath] ?? 0;
        const newVal = readNumber(item, coinPath);
        const delta = Math.round((newVal - oldVal) * 10000) / 10000;
        if (delta !== 0) {
          const coinIcon = `<i class="fa-solid fa-coins"></i>`;
          const sign = delta > 0 ? "+" : "-";
          const abs = Math.abs(delta);
          const name = adapter.getCoinLabel(coinPath);
          const isSimple = getWorldBool("simpleOutput");

          const text = isSimple
            ? `${name}: ${sign} ${abs}`
            : `${name}: ${oldVal} ${sign} ${abs} → ${newVal}`;

          const line = `${coinIcon} <span class="tm-actor">${link} (${safeItemName})</span> <span class="tm-text">${text}</span>`;
          const cls = delta > 0 ? "tiny-monitor-currency-gain" : "tiny-monitor-currency-loss";
          addMsg(line, cls, "currency");
        }
      }
    } else if (data.currencyBase && data.currencyCoins) {
      for (const k of data.currencyCoins) {
        const oldVal = data.currencyOld[k] ?? 0;
        const newVal = readNumber(item, `${data.currencyBase}.${k}`);
        const delta = Math.round((newVal - oldVal) * 10000) / 10000;
        if (delta !== 0) {
          const coinIcon = `<i class="fa-solid fa-coins"></i>`;
          const sign = delta > 0 ? "+" : "-";
          const abs = Math.abs(delta);
          const name = adapter.getCoinLabel(k);
          const isSimple = getWorldBool("simpleOutput");

          const text = isSimple
            ? `${name}: ${sign} ${abs}`
            : `${name}: ${oldVal} ${sign} ${abs} → ${newVal}`;

          const line = `${coinIcon} <span class="tm-actor">${link} (${safeItemName})</span> <span class="tm-text">${text}</span>`;
          const cls = delta > 0 ? "tiny-monitor-currency-gain" : "tiny-monitor-currency-loss";
          addMsg(line, cls, "currency");
        }
      }
    }
  }

  if (messagesToCreate.length > 0) queueMessages(...messagesToCreate);
}

// -------------------------------
// Delete Item (No Debounce necessary)
// -------------------------------

Hooks.on("preDeleteItem", (item, options, userId) => {
  if (!getWorldBool("trackItemChanges")) return;
  if (!(item.parent instanceof Actor)) return;
  if (isNameBlacklisted(item.name)) return;

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
  if (isNameBlacklisted(payload.name)) return;

  const { hasQty, qty, link, whisper, name } = payload;
  const oldQty = Number(qty ?? 0);

  if (hasQty && oldQty === 0) return;

  const treatAsSingleton = !hasQty || oldQty <= 1;
  const icon = `<i class="fa-solid fa-backpack"></i>`;

  const safeName = escapeHTML(name);
  const line = (treatAsSingleton || getWorldBool("simpleOutput"))
    ? `${icon} ${link} deleted ${safeName}`
    : `${icon} ${link} ${safeName}: ${oldQty} - ${oldQty} → 0`;

  queueMessages(buildMonitorMessageData(null, line, "tiny-monitor-item-dec", "item", true, null, whisper));
});

// -------------------------------
// Active Effect Tracking
// -------------------------------

/**
 * The actor an effect applies to. ActiveEffect#target is the parent actor, or the owning actor for
 * transferred item effects; non-transfer item effects (e.g. spell effects meant for targets, enchantments)
 * target their item and are ignored.
 */
function resolveEffectActor(effect) {
  const target = effect.target;
  return target instanceof Actor ? target : null;
}

Hooks.on("createActiveEffect", async (effect, options, userId) => {
  if (userId !== game.userId || !getWorldBool("trackActiveEffects")) return;
  const effName = effect.name || "Unknown Effect";
  if (isNameBlacklisted(effName)) return;
  const actor = resolveEffectActor(effect);
  if (!actor) return;

  const link = getActorLink(actor);
  const safeEffName = escapeHTML(effName);
  const icon = `<i class="fa-solid fa-sparkles"></i>`;
  const line = `${icon} ${link} gained effect: ${safeEffName}`;
  await postMonitorMessage(actor, line, "tiny-monitor-effect-add", "effect", true);
});

Hooks.on("preDeleteActiveEffect", (effect, options, userId) => {
  if (!getWorldBool("trackActiveEffects")) return;
  const effName = effect.name || "Unknown Effect";
  if (isNameBlacklisted(effName)) return;
  const actor = resolveEffectActor(effect);
  if (!actor) return;

  EFFECT_DELETE_STASH.set(effect, {
    link: getActorLink(actor),
    whisper: buildRecipients(actor),
    name: effName
  });
});

Hooks.on("deleteActiveEffect", async (effect, options, userId) => {
  if (userId !== game.userId || !getWorldBool("trackActiveEffects")) return;
  const payload = EFFECT_DELETE_STASH.get(effect);
  EFFECT_DELETE_STASH.delete(effect);
  if (!payload) return;
  if (isNameBlacklisted(payload.name)) return;

  const safeEffName = escapeHTML(payload.name);
  const icon = `<i class="fa-solid fa-sparkles"></i>`;
  const line = `${icon} ${payload.link} lost effect: ${safeEffName}`;

  queueMessages(buildMonitorMessageData(null, line, "tiny-monitor-effect-remove", "effect", true, null, payload.whisper));
});

Hooks.on("updateActiveEffect", async (effect, change, options, userId) => {
  if (userId !== game.userId || !getWorldBool("trackActiveEffects")) return;
  if (!foundry.utils.hasProperty(change, "disabled")) return;
  const effName = effect.name || "Unknown Effect";
  if (isNameBlacklisted(effName)) return;

  const actor = resolveEffectActor(effect);
  if (!actor) return;

  const newDisabled = Boolean(effect.disabled);
  const link = getActorLink(actor);
  const safeEffName = escapeHTML(effName);
  const icon = `<i class="fa-solid fa-sparkles"></i>`;
  const action = newDisabled ? "disabled" : "enabled";
  const cls = newDisabled ? "tiny-monitor-effect-disable" : "tiny-monitor-effect-enable";
  const line = `${icon} ${link} ${action} effect: ${safeEffName}`;
  await postMonitorMessage(actor, line, cls, "effect", true);
});

function shouldHideMessage(message) {
  const whisper = message.whisper ?? [];

  if (whisper.length > 0 && !whisper.includes(game.user.id)) {
    // Non-GMs who are not in the whisper list should never see the message (e.g. GM only visibility)
    if (!game.user.isGM) return true;

    // GMs shouldn't see it if visibility is strictly "Player only"
    const visibility = getSetting("messageVisibility", "gm-player") ?? "gm-player";
    if (visibility === "player") return true;
  }

  return false;
}

function applyMonitorStyling(message, html) {
  const li = html.closest(".chat-message") ?? html;
  if (message.getFlag(MOD_ID, "kind") === "chat-delete") {
    li.classList.add("tm-deleted");
    return;
  }
  if (!message.getFlag(MOD_ID, "isMonitorMsg")) return;

  if (shouldHideMessage(message)) {
    li.classList.add("tm-hidden");
    return;
  }

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

/** Describe the kind of a deleted message for the summary line. */
function describeDeletedMessage(message) {
  if ((message.whisper ?? []).length > 0) return "whisper";
  if ((message.rolls ?? []).length > 0) return "roll";
  if (message.type && message.type !== "base" && message.type !== "other") return "card";
  return "message";
}

/** Get the original message body HTML, preferring a full re-render (handles dynamic system cards). */
async function getDeletedMessageBody(message) {
  try {
    const el = await message.renderHTML?.({ canDelete: false, canClose: false });
    const body = el?.querySelector?.(".message-content");
    if (body?.innerHTML?.trim()) return body.innerHTML;
  } catch (err) {
    console.warn(`[${MOD_ID}] Could not re-render deleted message`, err);
  }
  return `${message.flavor ?? ""}${message.content ?? ""}`;
}

Hooks.on("deleteChatMessage", async (message, options, userId) => {
  if (!game.user.isGM || game.users.activeGM?.id !== game.user.id) return;

  const deletingUser = game.users.get(userId);
  if (!deletingUser || deletingUser.isGM) return;

  if (!getWorldBool("trackDeletedMessages", true)) return;

  // Skip chat log flushes and our own deletion notices.
  // Deleted changelog entries are intentionally still reported so players can't hide changes.
  if (options?.deleteAll) return;
  if (message.getFlag(MOD_ID, "kind") === "chat-delete") return;
  const isMonitor = Boolean(message.getFlag(MOD_ID, "isMonitorMsg"));

  const gmUsers = game.users.filter(u => u.isGM).map(u => u.id);
  if (gmUsers.length === 0) return;

  const userName = escapeHTML(deletingUser.name || "Unknown Player");
  const alias = escapeHTML(message.alias || message.speaker?.alias || message.author?.name || "Unknown");
  const label = isMonitor ? "changelog entry" : describeDeletedMessage(message);
  let entryText = "";
  if (isMonitor) {
    // <template> content is inert: parsing it does not fetch images (e.g. custom tracker icons)
    const tmp = document.createElement("template");
    tmp.innerHTML = message.content ?? "";
    entryText = escapeHTML((tmp.content.textContent ?? "").trim());
  }
  const whisperNames = (message.whisper ?? [])
    .map(id => escapeHTML(game.users.get(id)?.name ?? "?")).join(", ");
  const audience = whisperNames ? `whispered to ${whisperNames}` : "public";
  const time = new Date(message.timestamp ?? Date.now()).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const body = await getDeletedMessageBody(message);

  const content = `<details class="tm-deleted-details">`
    + `<summary class="tm-deleted-summary"><i class="fa-solid fa-trash"></i> `
    + `<span class="tm-deleted-text"><strong>${userName}</strong> deleted a ${label}${isMonitor ? `: ${entryText}` : ` from <strong>${alias}</strong>`}</span>`
    + `<span class="tm-deleted-time">${escapeHTML(time)}</span></summary>`
    + `<div class="tm-deleted-meta">${alias} · ${audience} · ${escapeHTML(time)}</div>`
    + `<div class="tm-deleted-body">${body}</div></details>`;

  await ChatMessage.create({
    author: game.user.id,
    speaker: ChatMessage.getSpeaker({ user: game.user }),
    whisper: gmUsers,
    content,
    flags: { [MOD_ID]: { kind: "chat-delete" } }
  });
});

// Prevent non-GMs from deleting changelog entries to hide changes
Hooks.on("preDeleteChatMessage", (message, options, userId) => {
  if (game.user.isGM || userId !== game.user.id) return;
  if (!getWorldBool("protectChangelogMessages", true)) return;
  if (!message.getFlag(MOD_ID, "isMonitorMsg")) return;
  ui.notifications.warn("Changelog messages can only be deleted by a GM.");
  return false;
});