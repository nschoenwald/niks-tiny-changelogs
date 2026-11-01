// Setting registration and cached setting reads.

import { MOD_ID } from "./constants.mjs";
import { settingText } from "./i18n.mjs";
import CustomTrackerConfig from "./custom-tracker-config.mjs";
import SettingsImportExportApp from "./settings-import-export.mjs";
import { LEGACY_TRACKERS_SETTING, TRACKERS_SETTING, parseCustomResources, readStoredCustomResources } from "./custom-resources.mjs";

// Cached world setting values. game.settings.get scans every world Setting document
// (and constructs a new Setting when the value was never saved), so reads are cached
// and invalidated through the Setting document hooks.
const SETTINGS_CACHE = new Map();
const CACHE_CLEARERS = [];

let cachedCustomResources = null;

/** Run `clear` whenever a setting of this module changes, to reset a cache derived from setting values. */
export function onSettingsChange(clear) {
  CACHE_CLEARERS.push(clear);
}

function onSettingDocumentChange(setting) {
  if (!setting?.key?.startsWith(`${MOD_ID}.`)) return;
  SETTINGS_CACHE.clear();
  cachedCustomResources = null;
  for (const clear of CACHE_CLEARERS) clear();
}

Hooks.on("createSetting", onSettingDocumentChange);
Hooks.on("updateSetting", onSettingDocumentChange);
Hooks.on("deleteSetting", onSettingDocumentChange);

export function getSetting(key, def) {
  if (SETTINGS_CACHE.has(key)) return SETTINGS_CACHE.get(key);
  try {
    const value = game.settings.get(MOD_ID, key);
    SETTINGS_CACHE.set(key, value);
    return value;
  } catch {
    return def;
  }
}

export function getWorldBool(key, def = false) {
  return Boolean(getSetting(key, def));
}

/** A manual data path setting, or null when it is empty. */
export function getWorldPath(key) {
  const v = getSetting(key, null);
  return (typeof v === "string" && v.trim().length) ? v.trim() : null;
}

export function getCustomResources() {
  cachedCustomResources ??= readStoredCustomResources(key => getSetting(key));
  return cachedCustomResources;
}

/** @param {import("./systems/base.mjs").default} adapter  Registers the system-specific settings */
export function registerSettings(adapter) {
  game.settings.register(MOD_ID, "compactMessages", {
    ...settingText("compactMessages"),
    scope: "world", config: true, type: Boolean, default: true
  });

  game.settings.register(MOD_ID, "messageStyle", {
    ...settingText("messageStyle"),
    scope: "world", config: true, type: String,
    choices: {
      tinted: "NTCL.Settings.messageStyle.Tinted",
      solid: "NTCL.Settings.messageStyle.Solid",
      accent: "NTCL.Settings.messageStyle.Accent"
    },
    default: "tinted"
  });

  game.settings.register(MOD_ID, "simpleOutput", {
    ...settingText("simpleOutput"),
    scope: "world", config: true, type: Boolean, default: false
  });

  game.settings.register(MOD_ID, "messageVisibility", {
    ...settingText("messageVisibility"),
    scope: "world", config: true, type: String,
    choices: {
      "gm": "NTCL.Settings.messageVisibility.GM",
      "gm-player": "NTCL.Settings.messageVisibility.GMPlayer",
      "everyone": "NTCL.Settings.messageVisibility.Everyone",
      "player": "NTCL.Settings.messageVisibility.Player"
    },
    default: "gm-player"
  });

  game.settings.register(MOD_ID, "npcAudience", {
    ...settingText("npcAudience"),
    scope: "world", config: true, type: String,
    choices: {
      "gm": "NTCL.Settings.npcAudience.GM",
      "gm-owners": "NTCL.Settings.npcAudience.GMOwners",
      "everyone": "NTCL.Settings.npcAudience.Everyone"
    },
    default: "gm-owners"
  });

  game.settings.register(MOD_ID, "trackCurrency", {
    ...settingText("trackCurrency"),
    scope: "world", config: true, type: Boolean, default: true
  });

  game.settings.register(MOD_ID, "trackItemChanges", {
    ...settingText("trackItemChanges"),
    scope: "world", config: true, type: Boolean, default: true
  });

  game.settings.register(MOD_ID, "trackDeletedMessages", {
    ...settingText("trackDeletedMessages"),
    scope: "world", config: true, type: Boolean, default: true
  });

  game.settings.register(MOD_ID, "protectChangelogMessages", {
    ...settingText("protectChangelogMessages"),
    scope: "world", config: true, type: Boolean, default: true
  });

  game.settings.register(MOD_ID, "trackEquipUnequip", {
    ...settingText("trackEquipUnequip"),
    scope: "world", config: true, type: Boolean, default: false
  });

  game.settings.register(MOD_ID, "trackActiveEffects", {
    ...settingText("trackActiveEffects"),
    scope: "world", config: true, type: Boolean, default: false
  });

  game.settings.register(MOD_ID, "nameBlacklist", {
    ...settingText("nameBlacklist"),
    scope: "world", config: true, type: String, default: ""
  });

  // Delegate system specific settings
  adapter.registerSettings();

  game.settings.registerMenu(MOD_ID, "customTrackedResourcesMenu", {
    name: "NTCL.Settings.customTrackersMenu.Name",
    label: "NTCL.Settings.customTrackersMenu.Label",
    hint: "NTCL.Settings.customTrackersMenu.Hint",
    icon: "fas fa-cogs",
    type: CustomTrackerConfig,
    restricted: true
  });

  game.settings.register(MOD_ID, TRACKERS_SETTING, {
    scope: "world",
    config: false,
    type: new foundry.data.fields.ArrayField(new foundry.data.fields.ObjectField()),
    default: []
  });

  // Pre-14.16.0 storage as a JSON string, kept registered so migrateSettings can read it
  game.settings.register(MOD_ID, LEGACY_TRACKERS_SETTING, {
    scope: "world",
    config: false,
    type: String,
    default: "[]"
  });

  game.settings.registerMenu(MOD_ID, "importExportMenu", {
    name: "NTCL.Settings.importExportMenu.Name",
    label: "NTCL.Settings.importExportMenu.Label",
    hint: "NTCL.Settings.importExportMenu.Hint",
    icon: "fas fa-file-import",
    type: SettingsImportExportApp,
    restricted: true
  });

  game.settings.register(MOD_ID, "autoDetectPaths", {
    ...settingText("autoDetectPaths"),
    scope: "world", config: true, type: Boolean, default: true
  });

  game.settings.register(MOD_ID, "hpPath", {
    ...settingText("hpPath"),
    scope: "world", config: true, type: String, default: ""
  });

  game.settings.register(MOD_ID, "tempHpPath", {
    ...settingText("tempHpPath"),
    scope: "world", config: true, type: String, default: ""
  });

  game.settings.register(MOD_ID, "tempHpMaxPath", {
    ...settingText("tempHpMaxPath"),
    scope: "world", config: true, type: String, default: ""
  });

  game.settings.register(MOD_ID, "currencyBasePath", {
    ...settingText("currencyBasePath"),
    scope: "world", config: true, type: String, default: ""
  });
}

/** Migrate setting values from older versions. Runs on the GM client. */
export async function migrateSettings() {
  // 14.13.6 replaced the NPC audience "gm-players" with "everyone"
  if (getSetting("npcAudience") === "gm-players") await game.settings.set(MOD_ID, "npcAudience", "everyone");

  // 14.16.0 stores custom trackers as an array instead of a JSON string
  const legacy = parseCustomResources(getSetting(LEGACY_TRACKERS_SETTING, "[]"));
  if (legacy.length) {
    if (!getSetting(TRACKERS_SETTING, []).length) await game.settings.set(MOD_ID, TRACKERS_SETTING, legacy);
    await game.settings.set(MOD_ID, LEGACY_TRACKERS_SETTING, "[]");
  }
}
