// Shared helpers for custom tracked resource definitions.

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
      console.error("[niks-tiny-changelogs] Failed to parse custom tracked resources:", e);
      list = [];
    }
  }
  if (!Array.isArray(list)) return [];
  return list.filter(res => res && typeof res === "object").map(normalizeCustomResource);
}
