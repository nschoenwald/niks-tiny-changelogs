// Pure helpers shared by the trackers and the system adapters.

import { MAX_NAME_CHARS } from "./constants.mjs";
import { getWorldBool } from "./settings.mjs";

export function escapeHTML(str) {
  return foundry.utils.escapeHTML(String(str ?? ""));
}

function clipName(name) {
  const chars = Array.from(String(name ?? ""));
  if (chars.length <= MAX_NAME_CHARS) return chars.join("");
  return chars.slice(0, MAX_NAME_CHARS).join("") + "…";
}

export function getActorLink(actor) {
  const rawName = actor?.token?.name ?? actor?.name ?? "";
  // Braces would end the @UUID label early; HTML in names must stay text
  const label = escapeHTML(clipName(rawName).replace(/{/g, "(").replace(/}/g, ")"));
  return `@UUID[${actor?.uuid ?? ""}]{${label}}`;
}

/** A Font Awesome solid icon. */
export function icon(name) {
  return `<i class="fa-solid fa-${name}"></i>`;
}

/** A single-line changelog entry: icon, actor (shrinks first) and text (always fully visible). */
export function formatLine(iconHtml, actorHtml, text) {
  return `${iconHtml} <span class="tm-actor">${actorHtml}</span> <span class="tm-text">${text}</span>`;
}

export function readNumber(doc, path) {
  if (!path) return 0;
  const v = foundry.utils.getProperty(doc, path);
  return Number.isFinite(Number(v)) ? Number(v) : 0;
}

export function readRaw(doc, path) {
  if (!path) return undefined;
  return foundry.utils.getProperty(doc, path);
}

export function willUpdatePath(update, path) {
  return Boolean(path) && foundry.utils.hasProperty(update, path);
}

/** Whether an update touches any of the given top-level keys. */
export function updateTouchesRoots(update, roots) {
  for (const key of Object.keys(update ?? {})) {
    // Tolerate legacy "-=" / "==" operator prefixes (V13)
    if (roots.has(key.split(".")[0].replace(/^(-=|==)/, ""))) return true;
  }
  return false;
}

/** Difference between two values, rounded so floating point noise (e.g. 0.1 + 0.2) does not count as a change. */
export function getDelta(oldVal, newVal) {
  return Math.round((newVal - oldVal) * 10000) / 10000;
}

/**
 * Describe a numeric change as "old ± diff → new", or only "± diff" with Simplified Output.
 * @param {number} oldVal
 * @param {number} newVal
 * @param {object} [options]
 * @param {(n: number) => string} [options.format]  Formats each number
 * @param {string} [options.suffix]                 Appended to the full form (e.g. " / 5")
 */
export function formatChange(oldVal, newVal, { format = String, suffix = "" } = {}) {
  const delta = getDelta(oldVal, newVal);
  const sign = delta > 0 ? "+" : "-";
  const abs = format(Math.abs(delta));
  if (getWorldBool("simpleOutput")) return `${sign} ${abs}`;
  return `${format(oldVal)} ${sign} ${abs} → ${format(newVal)}${suffix}`;
}

function isPlainObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

/**
 * Merge `source` into `target`, keeping values already in `target`. Plain objects are merged key by key,
 * anything else is taken whole. Used to combine the old values of several updates: the first one wins.
 */
export function mergeFirst(target, source) {
  for (const [key, value] of Object.entries(source ?? {})) {
    if (value === undefined) continue;
    if (target[key] === undefined) target[key] = foundry.utils.deepClone(value);
    else if (isPlainObject(target[key]) && isPlainObject(value)) mergeFirst(target[key], value);
  }
  return target;
}
