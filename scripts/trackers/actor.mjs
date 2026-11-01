// Actor changes: HP, temp HP, currency, system-specific values and custom tracked values.

import { MOD_ID } from "../constants.mjs";
import { adapter } from "../systems/index.mjs";
import { getCustomResources, getWorldBool, getWorldPath, onSettingsChange } from "../settings.mjs";
import { isNameBlacklisted } from "../blacklist.mjs";
import { createEmitter } from "../messages.mjs";
import { stashCurrency, reportCurrency } from "../currency.mjs";
import ChangeDebouncer from "../debounce.mjs";
import { t } from "../i18n.mjs";
import {
  describeChange, escapeHTML, formatLine, getActorLink, getDelta, readNumber, toneOf, updateTouchesRoots, willUpdatePath
} from "../utils.mjs";

let cachedActiveCustomResources = null;
let cachedWatchedRoots = null;
onSettingsChange(() => {
  cachedActiveCustomResources = null;
  cachedWatchedRoots = null;
});

/** Custom resources with a valid path whose name is not blacklisted. */
function getActiveCustomResources() {
  cachedActiveCustomResources ??= getCustomResources().filter(res => res.path && !isNameBlacklisted(res.name));
  return cachedActiveCustomResources;
}

/** Top-level update keys that can affect anything tracked on an actor. */
function getWatchedRoots() {
  if (cachedWatchedRoots) return cachedWatchedRoots;
  const paths = [
    getWorldPath("hpPath"),
    getWorldPath("tempHpPath"),
    getWorldPath("tempHpMaxPath"),
    getWorldPath("currencyBasePath"),
    ...getCustomResources().map(res => res.path)
  ];
  cachedWatchedRoots = new Set(["system"]);
  for (const path of paths) {
    if (typeof path === "string" && path.trim()) cachedWatchedRoots.add(path.trim().split(".")[0]);
  }
  return cachedWatchedRoots;
}

/** Health paths from the adapter, or from the manual path settings when auto-detection is off. */
function resolveHealthPaths(actor) {
  const detected = adapter.getHealthPaths(actor);
  if (getWorldBool("autoDetectPaths", true)) return detected;
  return {
    hpPath: getWorldPath("hpPath"),
    tempPath: getWorldPath("tempHpPath"),
    tempMaxPath: getWorldPath("tempHpMaxPath"),
    damageSystem: detected.damageSystem
  };
}

/**
 * Old values of everything tracked that the update will change.
 * @returns {object|null}  {hp, temp, tempMax, currency, system, custom}, or null when nothing tracked changes
 */
function stashActorChanges(actor, change) {
  const { hpPath, tempPath, tempMaxPath } = resolveHealthPaths(actor);
  const stash = {
    hp: willUpdatePath(change, hpPath) ? readNumber(actor, hpPath) : undefined,
    temp: willUpdatePath(change, tempPath) ? readNumber(actor, tempPath) : undefined,
    tempMax: willUpdatePath(change, tempMaxPath) ? readNumber(actor, tempMaxPath) : undefined,
    currency: stashCurrency(actor, change),
    system: adapter.stashActorChanges(actor, change) ?? undefined,
    custom: undefined
  };

  // Custom tracked values, keyed by path
  const changedCustom = getActiveCustomResources().filter(res => willUpdatePath(change, res.path));
  if (changedCustom.length) stash.custom = Object.fromEntries(changedCustom.map(res => [res.path, readNumber(actor, res.path)]));

  return Object.values(stash).some(v => v !== undefined) ? stash : null;
}

/** Post a "label  +5  10 → 15" line for a value that changed. */
function reportValue(actor, emit, path, old, { label, icon, tone, kind }) {
  if (old === undefined || !path) return;
  const now = readNumber(actor, path);
  const delta = getDelta(old, now);
  if (delta === 0) return;
  const line = formatLine({ icon: typeof icon === "function" ? icon(delta) : icon, actor: getActorLink(actor), text: label, ...describeChange(old, now) });
  emit(line, typeof tone === "function" ? tone(delta) : tone, kind);
}

function reportCustomResources(actor, stash, emit) {
  const link = getActorLink(actor);
  for (const res of getActiveCustomResources()) {
    const old = stash[res.path];
    if (old === undefined) continue;
    const now = readNumber(actor, res.path);
    const delta = getDelta(old, now);
    if (delta === 0) continue;

    // Replacer functions, so "$" sequences in names are not treated as replacement patterns
    const actionMsg = (delta > 0 ? res.msgGain : res.msgLoss)
      .replace(/{name}/g, () => res.name)
      .replace(/{old}/g, () => String(old))
      .replace(/{new}/g, () => String(now))
      .replace(/{diff}/g, () => String(Math.abs(delta)));
    const iconHtml = (res.icon.includes("/") || res.icon.includes("."))
      ? `<img class="tm-custom-icon" src="${escapeHTML(res.icon)}" alt="" />`
      : `<i class="${escapeHTML(res.icon)}"></i>`;
    const line = formatLine({ iconHtml, actor: link, text: escapeHTML(actionMsg), ...describeChange(old, now) });
    emit(line, "custom", "custom", { color: res.color });
  }
}

function reportActorChanges(actor, stash) {
  const { hpPath, tempPath, tempMaxPath, damageSystem, tempMaxLabel = t("Line.TempMax") } = resolveHealthPaths(actor);
  const emit = createEmitter(actor);

  // In damage systems (Demonlord) the value counts damage taken, so an increase is a loss
  const healed = delta => (damageSystem ? delta < 0 : delta > 0);
  reportValue(actor, emit, hpPath, stash.hp, {
    label: damageSystem ? t("Line.Damage") : t("Line.HP"),
    icon: delta => (healed(delta) ? "heart" : "heart-crack"),
    tone: delta => (healed(delta) ? "gain" : "loss"),
    kind: "hp"
  });
  reportValue(actor, emit, tempPath, stash.temp, { label: t("Line.TempHP"), icon: "shield-halved", tone: toneOf, kind: "temp" });
  reportValue(actor, emit, tempMaxPath, stash.tempMax, { label: tempMaxLabel, icon: "circle-plus", tone: toneOf, kind: "tempmax" });

  if (stash.currency) reportCurrency(actor, stash.currency, emit);
  if (stash.system) adapter.reportActorChanges(actor, stash.system, emit);
  if (stash.custom) reportCustomResources(actor, stash.custom, emit);
}

const debouncer = new ChangeDebouncer(reportActorChanges);

export function registerActorTracking() {
  Hooks.on("preUpdateActor", (actor, change, options, userId) => {
    if (!adapter.isTrackedActor(actor)) return;
    // Skip updates that cannot touch anything tracked (e.g. flag-only, name, image or ownership updates)
    if (!updateTouchesRoots(change, getWatchedRoots())) return;
    const stash = stashActorChanges(actor, change);
    if (!stash) return;
    // Keyed by document ID: one operation can update several actors with shared options
    options[MOD_ID] ??= {};
    options[MOD_ID][actor.id] = stash;
  });

  Hooks.on("updateActor", (actor, change, options, userId) => {
    const stash = options?.[MOD_ID]?.[actor.id];
    if (userId !== game.userId || !stash) return;
    debouncer.push(actor, stash);
  });
}
