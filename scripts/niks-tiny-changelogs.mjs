// Nik's Tiny Change Logs for Foundry VTT
// Posts one-line chat messages for actor, item and effect changes.
// System-specific data is read through the active system's adapter (scripts/systems/).

import { MOD_ID } from "./constants.mjs";
import { registerSettings, migrateSettings } from "./settings.mjs";
import { initAdapter } from "./systems/index.mjs";
import { registerMessages } from "./messages.mjs";
import { registerActorTracking } from "./trackers/actor.mjs";
import { registerItemTracking } from "./trackers/item.mjs";
import { registerEffectTracking } from "./trackers/effects.mjs";
import { registerChatModeration } from "./chat-moderation.mjs";

Hooks.once("init", () => {
  registerSettings(initAdapter(game.system.id));
  registerMessages();
  registerActorTracking();
  registerItemTracking();
  registerEffectTracking();
  registerChatModeration();
  console.log(`[${MOD_ID}] Initialized.`);
});

Hooks.once("ready", () => {
  if (game.user.isGM) migrateSettings();
});
