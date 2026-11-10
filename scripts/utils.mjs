// Pure helpers shared by the trackers and the system adapters.

import { MAX_NAME_CHARS } from "./constants.mjs";
import { getWorldBool } from "./settings.mjs";

/**
 * Whether another module asked not to log this document operation, by passing
 * `{ niksTinyChangelogs: { skip: true } }` in the operation options (create, update or delete). Used by
 * Nik's Give & Take, which posts its own message for a transfer.
 * @param {object} [options]  The operation options passed to the document hooks.
 * @returns {boolean}
 */
export function isSkipped(options) {
  return options?.niksTinyChangelogs?.skip === true;
}

export function escapeHTML(str) {
  return foundry.utils.escapeHTML(String(str ?? ""));
}

function clipName(name) {
  const chars = Array.from(String(name ?? ""));
  if (chars.length <= MAX_NAME_CHARS) return chars.join("");
  return chars.slice(0, MAX_NAME_CHARS).join("") + "…";
}

/** A content link label: braces would end the @UUID label early, and HTML in names must stay text. */
function linkLabel(name) {
  return escapeHTML(String(name ?? "").replace(/{/g, "(").replace(/}/g, ")"));
}

export function getActorLink(actor) {
  return `@UUID[${actor?.uuid ?? ""}]{${linkLabel(clipName(actor?.token?.name ?? actor?.name ?? ""))}}`;
}

/** A link to an item that still exists; deleted items are shown by name only (escapeHTML). */
export function getItemLink(item) {
  return `@UUID[${item.uuid}]{${linkLabel(item.name)}}`;
}

/** A Font Awesome solid icon. */
export function icon(name) {
  return `<i class="fa-solid fa-${name}"></i>`;
}

/**
 * One changelog line: icon, actor, what changed, then the old and new value ("10 → 15") and the change ("+5").
 * The old and new value are left out with Simplified Output.
 * @param {object} parts
 * @param {string} [parts.icon]      Font Awesome icon name
 * @param {string} [parts.iconHtml]  Icon markup instead of `icon` (e.g. a custom image)
 * @param {string} parts.actor       Actor link
 * @param {string} [parts.text]      What changed (escaped HTML)
 * @param {string} [parts.delta]     The change, e.g. from describeChange
 * @param {string} [parts.detail]    Old and new value, e.g. from describeChange
 * @returns {string}
 */
export function formatLine({ icon: iconName, iconHtml, actor, text = "", delta = "", detail = "" }) {
  const parts = [
    `<span class="tm-icon">${iconHtml ?? icon(iconName)}</span>`,
    `<span class="tm-actor">${actor}</span>`,
    `<span class="tm-text">${text}</span>`
  ];
  // Old and new value, then the change: two right-aligned columns that wrap together (see Line Layout in the CSS)
  const values = [];
  if (detail && !getWorldBool("simpleOutput")) values.push(`<span class="tm-detail">${detail}</span>`);
  if (delta) values.push(`<span class="tm-delta">${delta}</span>`);
  if (values.length) parts.push(`<span class="tm-values">${values.join(" ")}</span>`);
  return parts.join(" ");
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
 * A numeric change for formatLine: the signed difference ("+5", "−5") and the old and new value ("10 → 15").
 * @param {number} oldVal
 * @param {number} newVal
 * @param {object} [options]
 * @param {(n: number) => string} [options.format]  Formats each number
 * @param {string} [options.suffix]                 Appended to the old and new value (e.g. " / 5")
 * @returns {{delta: string, detail: string}}
 */
export function describeChange(oldVal, newVal, { format = String, suffix = "" } = {}) {
  const delta = getDelta(oldVal, newVal);
  return {
    delta: `${delta > 0 ? "+" : "−"}${format(Math.abs(delta))}`,
    detail: `${format(oldVal)} → ${format(newVal)}${suffix}`
  };
}

/** The tone of a numeric change: "gain" for an increase, otherwise `down` ("loss" unless given). */
export function toneOf(delta, down = "loss") {
  return delta > 0 ? "gain" : down;
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
