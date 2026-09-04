import { clearCustomResourcesCache, clearNameBlacklistCache } from "./niks-tiny-changelogs.mjs";

const MOD_ID = "niks-tiny-changelogs";

/**
 * Utility function to prompt for confirmation using DialogV2 or legacy Dialog
 */
async function confirmDialog({ title, content }) {
  if (foundry.applications?.api?.DialogV2?.confirm) {
    return await foundry.applications.api.DialogV2.confirm({
      window: { title },
      content,
      modal: true
    });
  }
  return new Promise(resolve => {
    Dialog.confirm({
      title,
      content,
      yes: () => resolve(true),
      no: () => resolve(false),
      defaultYes: false
    });
  });
}

/**
 * Utility function to download a JSON payload as a file
 */
export function downloadJsonFile(filename, data) {
  const jsonStr = JSON.stringify(data, null, 2);
  const saveFn = foundry.utils?.saveDataToFile ?? globalThis.saveDataToFile;
  if (typeof saveFn === "function") {
    saveFn(jsonStr, "application/json", filename);
  } else {
    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  }
}

/**
 * Utility function to read text from an uploaded File object and parse as JSON
 */
export async function readJsonFile(file) {
  const readFn = foundry.utils?.readTextFromFile ?? globalThis.readTextFromFile;
  let raw;
  if (typeof readFn === "function") {
    raw = await readFn(file);
  } else {
    raw = await file.text();
  }
  return JSON.parse(raw);
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

  let customTrackers = [];
  if (settingsData.customTrackedResources) {
    try {
      customTrackers = typeof settingsData.customTrackedResources === "string"
        ? JSON.parse(settingsData.customTrackedResources)
        : settingsData.customTrackedResources;
    } catch {
      customTrackers = [];
    }
  }

  const exportPayload = {
    module: MOD_ID,
    title: "Nik's Tiny Change Logs Settings Export",
    version: game.modules.get(MOD_ID)?.version || "14.13.4",
    system: game.system.id,
    exportedAt: new Date().toISOString(),
    exportedBy: game.user.name,
    settings: settingsData,
    customTrackers: Array.isArray(customTrackers) ? customTrackers : []
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
    version: game.modules.get(MOD_ID)?.version || "14.13.4",
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
    incomingTrackers = data.customTrackers;
  } else if (incomingSettings.customTrackedResources) {
    try {
      incomingTrackers = typeof incomingSettings.customTrackedResources === "string"
        ? JSON.parse(incomingSettings.customTrackedResources)
        : incomingSettings.customTrackedResources;
    } catch {
      incomingTrackers = [];
    }
  } else if (Array.isArray(data)) {
    incomingTrackers = data;
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

  const confirmed = await confirmDialog({
    title: "Import Nik's Tiny Change Logs Settings",
    content: `<p>Found ${desc.join(" and ")} in <em>${escapeHTML(filename)}</em>.</p><p>Import and apply these configurations to your world now?</p>`
  });

  if (!confirmed) return { applied: false };

  let appliedSettingsCount = 0;

  // Apply general and system settings
  for (const key of matchingSettingKeys) {
    const value = incomingSettings[key];
    const current = game.settings.get(MOD_ID, key);
    if (current !== value) {
      await game.settings.set(MOD_ID, key, value);
      appliedSettingsCount++;
    }
  }

  // Apply custom trackers if provided
  let finalTrackersCount = 0;
  if (hasTrackers) {
    let finalTrackers = [];
    if (options.trackerMode === "merge") {
      let currentTrackers = [];
      try {
        const raw = game.settings.get(MOD_ID, "customTrackedResources");
        currentTrackers = raw ? JSON.parse(raw) : [];
      } catch {
        currentTrackers = [];
      }
      if (!Array.isArray(currentTrackers)) currentTrackers = [];

      const existingPaths = new Set(currentTrackers.map(t => t.path));
      finalTrackers = [...currentTrackers];
      for (const t of incomingTrackers) {
        if (!existingPaths.has(t.path)) {
          finalTrackers.push(t);
          existingPaths.add(t.path);
        }
      }
    } else {
      finalTrackers = incomingTrackers;
    }

    await game.settings.set(MOD_ID, "customTrackedResources", JSON.stringify(finalTrackers));
    finalTrackersCount = finalTrackers.length;
    clearCustomResourcesCache();
  }

  if (matchingSettingKeys.includes("nameBlacklist")) {
    clearNameBlacklistCache();
  }

  // Refresh any open settings or tracker config windows
  refreshOpenConfigWindows();

  const successDetails = [];
  if (appliedSettingsCount > 0) successDetails.push(`${appliedSettingsCount} setting(s) updated`);
  if (hasTrackers) successDetails.push(`${finalTrackersCount} custom tracker(s) configured`);
  const detailStr = successDetails.length > 0 ? ` (${successDetails.join(", ")})` : "";

  ui.notifications.info(`[${MOD_ID}] Successfully imported configurations from ${filename}${detailStr}.`);
  return {
    applied: true,
    appliedSettingsCount,
    trackersCount: finalTrackersCount
  };
}

function escapeHTML(str) {
  return foundry.utils?.escapeHTML ? foundry.utils.escapeHTML(String(str ?? "")) : String(str ?? "");
}

function refreshOpenConfigWindows() {
  // Close open settings windows so Foundry re-reads setting values on next open.
  // We rely solely on constructor-name checks (no `instanceof`) to avoid
  // ReferenceErrors when a class lives behind a namespace or doesn't exist as a
  // global.  We also snapshot each collection before iterating so that closing
  // an app (which mutates the registry) doesn't corrupt the iteration.

  // --- Legacy Application V1 windows (ui.windows) ---
  if (ui.windows) {
    const wins = Object.values(ui.windows);
    for (const win of wins) {
      const name = win?.constructor?.name;
      if (name === "SettingsConfig") {
        try { win.close(); } catch (e) {
          console.debug(`[${MOD_ID}] Failed to close V1 SettingsConfig:`, e);
        }
      } else if (name === "CustomTrackerConfig") {
        try { win.render(false); } catch (e) {
          console.debug(`[${MOD_ID}] Failed to re-render CustomTrackerConfig:`, e);
        }
      }
    }
  }

  // --- ApplicationV2 windows (Foundry V13+) ---
  // In V13+, SettingsConfig extends ApplicationV2 and registers in
  // foundry.applications.instances, NOT in ui.windows.
  try {
    const instances = foundry.applications?.instances;
    if (instances && typeof instances[Symbol.iterator] === "function") {
      const apps = [...instances];
      for (const [, app] of apps) {
        const name = app?.constructor?.name;
        if (name === "SettingsConfig" || name === "CategoryBrowser") {
          try { app.close(); } catch (e) {
            console.debug(`[${MOD_ID}] Failed to close V2 SettingsConfig:`, e);
          }
        }
      }
    }
  } catch (e) {
    console.debug(`[${MOD_ID}] Failed to iterate ApplicationV2 instances:`, e);
  }
}

/**
 * FormApplication for importing and exporting module settings and custom tracker configurations
 */
export default class SettingsImportExportApp extends FormApplication {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "niks-tiny-changelogs-import-export",
      title: "Nik's Tiny Change Logs: Import / Export Settings",
      template: "modules/niks-tiny-changelogs/templates/import-export.hbs",
      width: 560,
      height: "auto",
      closeOnSubmit: false,
      submitOnChange: false,
      classes: ["niks-tiny-changelogs-config", "niks-tiny-changelogs-import-export"]
    });
  }

  getData(options) {
    const registeredKeys = Array.from(game.settings.settings.keys())
      .filter(k => k.startsWith(`${MOD_ID}.`))
      .map(k => k.slice(MOD_ID.length + 1))
      .filter(k => k !== "customTrackedResources");

    let customTrackerCount = 0;
    try {
      const raw = game.settings.get(MOD_ID, "customTrackedResources");
      const parsed = raw ? JSON.parse(raw) : [];
      customTrackerCount = Array.isArray(parsed) ? parsed.length : 0;
    } catch {
      customTrackerCount = 0;
    }

    return {
      moduleVersion: game.modules.get(MOD_ID)?.version || "14.13.4",
      systemId: game.system.id,
      systemTitle: game.system.title || game.system.id,
      settingsCount: registeredKeys.length,
      customTrackerCount
    };
  }

  activateListeners(html) {
    super.activateListeners(html);

    // Export button
    html.find('[data-action="export-all"]').click((ev) => {
      ev.preventDefault();
      exportAllSettings();
    });

    // Import file button: trigger hidden file input
    const fileInput = html.find('input.import-file-input');
    html.find('[data-action="select-file"]').click((ev) => {
      ev.preventDefault();
      fileInput.val("");
      fileInput.click();
    });

    // File selected handler
    fileInput.change(async (ev) => {
      const file = ev.target.files?.[0];
      if (!file) return;

      if (!game.user.can("SETTINGS_MODIFY") && !game.user.isGM) {
        ui.notifications.error("You do not have permission to modify world settings.");
        return;
      }

      try {
        const data = await readJsonFile(file);
        const trackerMode = html.find('input[name="trackerMode"]:checked').val() || "replace";
        const result = await applyImportedData(data, file.name, { trackerMode });
        if (result.applied) {
          this.close();
        }
      } catch (err) {
        console.error(`[${MOD_ID}] Failed to import settings file:`, err);
        ui.notifications.error(`Import failed: ${err.message}`);
      }
    });
  }

  async _updateObject(event, formData) {
    // FormApplication requirement; export/import actions handle their own state
  }
}
