import { parseCustomResources } from "./custom-resources.mjs";

const MOD_ID = "niks-tiny-changelogs";
const TRACKER_CONFIG_ID = "niks-tiny-changelogs-custom-tracker-config";
const { ApplicationV2, HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;

/**
 * Utility function to download a JSON payload as a file
 */
export function downloadJsonFile(filename, data) {
  foundry.utils.saveDataToFile(JSON.stringify(data, null, 2), "application/json", filename);
}

/**
 * Utility function to read text from an uploaded File object and parse as JSON
 */
export async function readJsonFile(file) {
  return JSON.parse(await foundry.utils.readTextFromFile(file));
}

function getModuleVersion() {
  return game.modules.get(MOD_ID)?.version;
}

/**
 * Exports all settings registered under niks-tiny-changelogs, including custom trackers
 */
export function exportAllSettings() {
  const settingsData = {};

  for (const [fullKey] of game.settings.settings.entries()) {
    if (fullKey.startsWith(`${MOD_ID}.`)) {
      const key = fullKey.slice(MOD_ID.length + 1);
      try {
        settingsData[key] = game.settings.get(MOD_ID, key);
      } catch (err) {
        console.warn(`[${MOD_ID}] Failed to read setting "${key}":`, err);
      }
    }
  }

  const exportPayload = {
    module: MOD_ID,
    title: "Nik's Tiny Change Logs Settings Export",
    version: getModuleVersion(),
    system: game.system.id,
    exportedAt: new Date().toISOString(),
    exportedBy: game.user.name,
    settings: settingsData,
    customTrackers: parseCustomResources(settingsData.customTrackedResources ?? [])
  };

  const filename = `niks-tiny-changelogs-settings-${new Date().toISOString().slice(0, 10)}.json`;
  downloadJsonFile(filename, exportPayload);
  ui.notifications.info(`[${MOD_ID}] Settings exported to ${filename}`);
  return exportPayload;
}

/**
 * Exports custom tracker configs specifically
 */
export function exportCustomTrackers(trackers) {
  const list = Array.isArray(trackers) ? trackers : [];
  const exportPayload = {
    module: MOD_ID,
    type: "custom-trackers",
    title: "Nik's Tiny Change Logs Custom Trackers",
    version: getModuleVersion(),
    system: game.system.id,
    exportedAt: new Date().toISOString(),
    exportedBy: game.user.name,
    customTrackers: list
  };

  const filename = `niks-tiny-changelogs-custom-trackers-${new Date().toISOString().slice(0, 10)}.json`;
  downloadJsonFile(filename, exportPayload);
  ui.notifications.info(`[${MOD_ID}] Exported ${list.length} custom trackers to ${filename}`);
  return exportPayload;
}

/**
 * Imports settings and/or custom trackers from a parsed JSON object
 */
export async function applyImportedData(data, filename = "file.json", options = { trackerMode: "replace" }) {
  if (!data || typeof data !== "object") {
    throw new Error("Invalid JSON data: payload is not an object or array.");
  }

  // Validate module if present
  if (data.module && data.module !== MOD_ID) {
    throw new Error(`Invalid configuration file: file belongs to module "${data.module}", not "${MOD_ID}".`);
  }

  // Extract settings and custom trackers
  const incomingSettings = (data.settings && typeof data.settings === "object") ? { ...data.settings } : {};
  let incomingTrackers = null;

  if (Array.isArray(data.customTrackers)) {
    incomingTrackers = parseCustomResources(data.customTrackers);
  } else if (incomingSettings.customTrackedResources) {
    incomingTrackers = parseCustomResources(incomingSettings.customTrackedResources);
  } else if (Array.isArray(data)) {
    incomingTrackers = parseCustomResources(data);
  }

  // Determine applicable settings count
  const matchingSettingKeys = Object.keys(incomingSettings).filter(key => {
    return key !== "customTrackedResources" && game.settings.settings.has(`${MOD_ID}.${key}`);
  });

  const hasSettings = matchingSettingKeys.length > 0;
  const hasTrackers = Array.isArray(incomingTrackers);
  const trackerCount = hasTrackers ? incomingTrackers.length : 0;

  if (!hasSettings && !hasTrackers) {
    throw new Error("No recognizable settings or custom tracker definitions found in the file.");
  }

  // Build confirmation message
  const modeLabel = options.trackerMode === "merge" ? "merge with" : "replace";
  const desc = [];
  if (hasSettings) {
    desc.push(`<strong>${matchingSettingKeys.length}</strong> module setting(s)`);
  }
  if (hasTrackers) {
    desc.push(`<strong>${trackerCount}</strong> custom tracker config(s) (will <em>${modeLabel}</em> existing trackers)`);
  }

  const confirmed = await DialogV2.confirm({
    window: { title: "Import Nik's Tiny Change Logs Settings" },
    content: `<p>Found ${desc.join(" and ")} in <em>${foundry.utils.escapeHTML(filename)}</em>.</p><p>Import and apply these configurations to your world now?</p>`,
    rejectClose: false,
    modal: true
  });

  if (!confirmed) return { applied: false };

  let appliedSettingsCount = 0;
  const failedKeys = [];

  // Apply general and system settings. A value that fails validation (e.g. a choice that no longer
  // exists) is skipped instead of aborting the import halfway through.
  for (const key of matchingSettingKeys) {
    const value = incomingSettings[key];
    try {
      if (game.settings.get(MOD_ID, key) !== value) {
        await game.settings.set(MOD_ID, key, value);
        appliedSettingsCount++;
      }
    } catch (err) {
      console.warn(`[${MOD_ID}] Skipped invalid imported value for setting "${key}":`, err);
      failedKeys.push(key);
    }
  }

  // Apply custom trackers if provided
  let finalTrackersCount = 0;
  if (hasTrackers) {
    let finalTrackers = incomingTrackers;
    if (options.trackerMode === "merge") {
      const currentTrackers = parseCustomResources(game.settings.get(MOD_ID, "customTrackedResources"));
      const existingPaths = new Set(currentTrackers.map(t => t.path));
      finalTrackers = [...currentTrackers];
      for (const t of incomingTrackers) {
        if (!existingPaths.has(t.path)) {
          finalTrackers.push(t);
          existingPaths.add(t.path);
        }
      }
    }

    await game.settings.set(MOD_ID, "customTrackedResources", JSON.stringify(finalTrackers));
    finalTrackersCount = finalTrackers.length;
  }

  refreshOpenConfigWindows();

  const successDetails = [];
  if (appliedSettingsCount > 0) successDetails.push(`${appliedSettingsCount} setting(s) updated`);
  if (hasTrackers) successDetails.push(`${finalTrackersCount} custom tracker(s) configured`);
  const detailStr = successDetails.length > 0 ? ` (${successDetails.join(", ")})` : "";

  ui.notifications.info(`[${MOD_ID}] Successfully imported configurations from ${filename}${detailStr}.`);
  if (failedKeys.length) {
    ui.notifications.warn(`[${MOD_ID}] Some settings had invalid values and were skipped: ${failedKeys.join(", ")}`);
  }
  return {
    applied: true,
    appliedSettingsCount,
    trackersCount: finalTrackersCount
  };
}

function refreshOpenConfigWindows() {
  // Close open settings windows so Foundry re-reads setting values on next open.
  // Snapshot the registry first, since closing an app mutates it.
  for (const app of [...foundry.applications.instances.values()]) {
    const name = app?.constructor?.name;
    if (name === "SettingsConfig" || name === "CategoryBrowser") {
      app.close().catch(e => console.debug(`[${MOD_ID}] Failed to close SettingsConfig:`, e));
    }
  }

  // An open tracker window keeps its own unsaved list; replace it with the imported one,
  // otherwise saving that window would overwrite the import.
  const trackerApp = foundry.applications.instances.get(TRACKER_CONFIG_ID);
  if (trackerApp) {
    trackerApp.reloadFromSettings();
    trackerApp.render();
  }
}

/**
 * Application for importing and exporting module settings and custom tracker configurations
 */
export default class SettingsImportExportApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "niks-tiny-changelogs-import-export",
    classes: ["niks-tiny-changelogs-config", "niks-tiny-changelogs-import-export"],
    window: { title: "Nik's Tiny Change Logs: Import / Export Settings", icon: "fas fa-file-import" },
    position: { width: 560, height: "auto" },
    actions: {
      exportAll: SettingsImportExportApp.#onExportAll,
      selectFile: SettingsImportExportApp.#onSelectFile
    }
  };

  static PARTS = {
    main: { template: `modules/${MOD_ID}/templates/import-export.hbs` }
  };

  async _prepareContext(options) {
    const registeredKeys = Array.from(game.settings.settings.keys())
      .filter(k => k.startsWith(`${MOD_ID}.`))
      .map(k => k.slice(MOD_ID.length + 1))
      .filter(k => k !== "customTrackedResources");

    return {
      moduleVersion: getModuleVersion(),
      systemId: game.system.id,
      systemTitle: game.system.title || game.system.id,
      settingsCount: registeredKeys.length,
      customTrackerCount: parseCustomResources(game.settings.get(MOD_ID, "customTrackedResources")).length
    };
  }

  _onRender(context, options) {
    super._onRender(context, options);
    const fileInput = this.element.querySelector("input.import-file-input");
    fileInput?.addEventListener("change", ev => this.#onFileSelected(ev));
  }

  static #onExportAll(event) {
    event.preventDefault();
    exportAllSettings();
  }

  static #onSelectFile(event) {
    event.preventDefault();
    const fileInput = this.element.querySelector("input.import-file-input");
    if (!fileInput) return;
    fileInput.value = "";
    fileInput.click();
  }

  async #onFileSelected(ev) {
    const file = ev.target.files?.[0];
    if (!file) return;

    if (!game.user.can("SETTINGS_MODIFY") && !game.user.isGM) {
      ui.notifications.error("You do not have permission to modify world settings.");
      return;
    }

    try {
      const data = await readJsonFile(file);
      const trackerMode = this.element.querySelector('input[name="trackerMode"]:checked')?.value || "replace";
      const result = await applyImportedData(data, file.name, { trackerMode });
      if (result.applied) this.close();
    } catch (err) {
      console.error(`[${MOD_ID}] Failed to import settings file:`, err);
      ui.notifications.error(`Import failed: ${err.message}`);
    }
  }
}
