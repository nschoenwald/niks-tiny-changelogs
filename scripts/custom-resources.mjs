// Shared helpers for custom tracked resource definitions.

import { MOD_ID } from "./constants.mjs";

/** World setting holding the tracker definitions (an array of objects). */
export const TRACKERS_SETTING = "customTrackers";

/** Before 14.16.0 the definitions were stored as a JSON string. Moved to TRACKERS_SETTING by migrateSettings. */
export const LEGACY_TRACKERS_SETTING = "customTrackedResources";

export const CUSTOM_RESOURCE_DEFAULTS = Object.freeze({
  name: "",
  path: "",
  msgGain: "gained {name}",
  msgLoss: "lost {name}",
  icon: "fa-solid fa-star",
  color: "#666666"
});

/**
 * Return a resource definition with every field present as a trimmed string, falling back to defaults.
 * Protects message processing against hand-edited or imported definitions with missing fields.
 * @param {object} res
 * @returns {typeof CUSTOM_RESOURCE_DEFAULTS}
 */
export function normalizeCustomResource(res) {
  const out = {};
  for (const [key, def] of Object.entries(CUSTOM_RESOURCE_DEFAULTS)) {
    const v = res?.[key];
    out[key] = (typeof v === "string" && v.trim()) ? v.trim() : def;
  }
  return out;
}

/**
 * Parse a stored or imported list of resource definitions, dropping anything that is not an object.
 * @param {string|object[]} raw
 * @returns {Array<typeof CUSTOM_RESOURCE_DEFAULTS>}
 */
export function parseCustomResources(raw) {
  let list = raw;
  if (typeof raw === "string") {
    try {
      list = raw ? JSON.parse(raw) : [];
    } catch (e) {
      console.error(`[${MOD_ID}] Failed to parse custom tracked resources:`, e);
      list = [];
    }
  }
  if (!Array.isArray(list)) return [];
  return list.filter(res => res && typeof res === "object").map(normalizeCustomResource);
}

/**
 * Tracker definitions from any supported export format: a settings or tracker export, or a bare array.
 * @param {object|object[]} data  Parsed JSON
 * @returns {Array<typeof CUSTOM_RESOURCE_DEFAULTS>|null}  Null when the data holds no tracker list
 */
export function extractCustomResources(data) {
  if (Array.isArray(data?.customTrackers)) return parseCustomResources(data.customTrackers);
  if (data?.settings?.customTrackedResources) return parseCustomResources(data.settings.customTrackedResources);
  if (Array.isArray(data)) return parseCustomResources(data);
  return null;
}

/**
 * Append incoming definitions whose path is not tracked yet. Existing definitions win.
 * @param {Array<typeof CUSTOM_RESOURCE_DEFAULTS>} current
 * @param {Array<typeof CUSTOM_RESOURCE_DEFAULTS>} incoming
 * @returns {Array<typeof CUSTOM_RESOURCE_DEFAULTS>}  A new list
 */
export function mergeCustomResources(current, incoming) {
  const merged = [...current];
  const paths = new Set(current.map(r => r.path));
  for (const res of incoming) {
    if (paths.has(res.path)) continue;
    merged.push(res);
    paths.add(res.path);
  }
  return merged;
}

/**
 * The stored tracker definitions. Falls back to the legacy JSON string setting until the GM's client has migrated it.
 * @param {(key: string) => *} [read]  Reads a setting of this module (e.g. a cached reader)
 * @returns {Array<typeof CUSTOM_RESOURCE_DEFAULTS>}
 */
export function readStoredCustomResources(read = key => game.settings.get(MOD_ID, key)) {
  const stored = read(TRACKERS_SETTING);
  if (Array.isArray(stored) && stored.length) return parseCustomResources(stored);
  return parseCustomResources(read(LEGACY_TRACKERS_SETTING) ?? []);
}

/**
 * Store tracker definitions.
 * @param {object[]} list
 */
export function saveCustomResources(list) {
  return game.settings.set(MOD_ID, TRACKERS_SETTING, parseCustomResources(list));
}
