// Active Effects on actors: added, removed, enabled, disabled.

import { getWorldBool } from "../settings.mjs";
import { isNameBlacklisted } from "../blacklist.mjs";
import { buildRecipients, createEmitter } from "../messages.mjs";
import { escapeHTML, formatLine, getActorLink } from "../utils.mjs";
import { getTrackedActor } from "./tracked-actor.mjs";
import { t } from "../i18n.mjs";

const EFFECT_DELETE_STASH = new WeakMap();

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
    createEmitter(actor).group("effects", "+", escapeHTML(name));
  });

  Hooks.on("preDeleteActiveEffect", (effect, options, userId) => {
    if (!getWorldBool("trackActiveEffects")) return;
    const name = getEffectName(effect);
    const actor = resolveEffectActor(effect);
    if (!actor || isNameBlacklisted(name)) return;
    EFFECT_DELETE_STASH.set(effect, { target: { uuid: actor.uuid, link: getActorLink(actor) }, whisper: buildRecipients(actor), name });
  });

  Hooks.on("deleteActiveEffect", (effect, options, userId) => {
    if (userId !== game.userId || !getWorldBool("trackActiveEffects")) return;
    const stash = EFFECT_DELETE_STASH.get(effect);
    EFFECT_DELETE_STASH.delete(effect);
    if (!stash || isNameBlacklisted(stash.name)) return;
    createEmitter(stash.target, stash.whisper).group("effects", "-", escapeHTML(stash.name));
  });

  Hooks.on("updateActiveEffect", (effect, change, options, userId) => {
    if (userId !== game.userId || !getWorldBool("trackActiveEffects")) return;
    if (!foundry.utils.hasProperty(change, "disabled")) return;
    const name = getEffectName(effect);
    const actor = resolveEffectActor(effect);
    if (!actor || isNameBlacklisted(name)) return;

    const disabled = Boolean(effect.disabled);
    const text = t(disabled ? "Line.EffectDisabled" : "Line.EffectEnabled", { effect: escapeHTML(name) });
    const line = formatLine({ icon: disabled ? "toggle-off" : "toggle-on", actor: getActorLink(actor), text });
    createEmitter(actor)(line, disabled ? "loss" : "gain", "effect");
  });
}
