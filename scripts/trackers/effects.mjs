// Active Effects on actors: added, removed, enabled, disabled.

import { getWorldBool } from "../settings.mjs";
import { isNameBlacklisted } from "../blacklist.mjs";
import { buildRecipients, createEmitter, postMonitorMessage } from "../messages.mjs";
import { escapeHTML, getActorLink, icon } from "../utils.mjs";
import { getTrackedActor } from "./tracked-actor.mjs";
import { t } from "../i18n.mjs";

const EFFECT_DELETE_STASH = new WeakMap();
const EFFECT_ICON = icon("sparkles");
const MULTILINE = { multiline: true };

/**
 * The actor an effect applies to. ActiveEffect#target is the parent actor, or the owning actor for
 * transferred item effects; non-transfer item effects (e.g. spell effects meant for targets, enchantments)
 * target their item and are ignored.
 */
function resolveEffectActor(effect) {
  return getTrackedActor(effect.target);
}

function getEffectName(effect) {
  return effect.name || t("Line.UnknownEffect");
}

export function registerEffectTracking() {
  Hooks.on("createActiveEffect", (effect, options, userId) => {
    if (userId !== game.userId || !getWorldBool("trackActiveEffects")) return;
    const name = getEffectName(effect);
    const actor = resolveEffectActor(effect);
    if (!actor || isNameBlacklisted(name)) return;
    const line = `${EFFECT_ICON} ${t("Line.EffectGained", { actor: getActorLink(actor), effect: escapeHTML(name) })}`;
    postMonitorMessage(actor, line, "tiny-monitor-effect-add", "effect", MULTILINE);
  });

  Hooks.on("preDeleteActiveEffect", (effect, options, userId) => {
    if (!getWorldBool("trackActiveEffects")) return;
    const name = getEffectName(effect);
    const actor = resolveEffectActor(effect);
    if (!actor || isNameBlacklisted(name)) return;
    EFFECT_DELETE_STASH.set(effect, { link: getActorLink(actor), whisper: buildRecipients(actor), name });
  });

  Hooks.on("deleteActiveEffect", (effect, options, userId) => {
    if (userId !== game.userId || !getWorldBool("trackActiveEffects")) return;
    const stash = EFFECT_DELETE_STASH.get(effect);
    EFFECT_DELETE_STASH.delete(effect);
    if (!stash || isNameBlacklisted(stash.name)) return;
    const line = `${EFFECT_ICON} ${t("Line.EffectLost", { actor: stash.link, effect: escapeHTML(stash.name) })}`;
    createEmitter(null, stash.whisper)(line, "tiny-monitor-effect-remove", "effect", MULTILINE);
  });

  Hooks.on("updateActiveEffect", (effect, change, options, userId) => {
    if (userId !== game.userId || !getWorldBool("trackActiveEffects")) return;
    if (!foundry.utils.hasProperty(change, "disabled")) return;
    const name = getEffectName(effect);
    const actor = resolveEffectActor(effect);
    if (!actor || isNameBlacklisted(name)) return;

    const disabled = Boolean(effect.disabled);
    const line = `${EFFECT_ICON} ${t(disabled ? "Line.EffectDisabled" : "Line.EffectEnabled", { actor: getActorLink(actor), effect: escapeHTML(name) })}`;
    postMonitorMessage(actor, line, disabled ? "tiny-monitor-effect-disable" : "tiny-monitor-effect-enable", "effect", MULTILINE);
  });
}
