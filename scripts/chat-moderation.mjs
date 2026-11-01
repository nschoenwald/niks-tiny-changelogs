// Chat moderation: reports chat messages deleted by players to the GM, and protects changelog messages.

import { MOD_ID } from "./constants.mjs";
import { getWorldBool } from "./settings.mjs";
import { escapeHTML } from "./utils.mjs";
import { t } from "./i18n.mjs";

// Fields a player could change to alter or hide a changelog entry
const PROTECTED_MESSAGE_FIELDS = ["content", "flavor", "whisper", "blind"];

/** Describe the kind of a deleted message for the summary line. */
function describeDeletedMessage(message) {
  if ((message.whisper ?? []).length > 0) return t("Chat.KindWhisper");
  if ((message.rolls ?? []).length > 0) return t("Chat.KindRoll");
  if (message.type && message.type !== "base" && message.type !== "other") return t("Chat.KindCard");
  return t("Chat.KindMessage");
}

/** Get the original message body HTML, preferring a full re-render (handles dynamic system cards). */
async function getDeletedMessageBody(message) {
  try {
    const el = await message.renderHTML?.({ canDelete: false, canClose: false });
    const body = el?.querySelector?.(".message-content");
    if (body?.innerHTML?.trim()) return body.innerHTML;
  } catch (err) {
    console.warn(`[${MOD_ID}] Could not re-render deleted message`, err);
  }
  return `${message.flavor ?? ""}${message.content ?? ""}`;
}

async function reportDeletedMessage(message, options, userId) {
  if (!game.user.isGM || game.users.activeGM?.id !== game.user.id) return;

  const deletingUser = game.users.get(userId);
  if (!deletingUser || deletingUser.isGM) return;

  if (!getWorldBool("trackDeletedMessages", true)) return;

  // Skip chat log flushes and our own deletion notices.
  // Deleted changelog entries are intentionally still reported so players can't hide changes.
  if (options?.deleteAll) return;
  if (message.getFlag(MOD_ID, "kind") === "chat-delete") return;
  const isMonitor = Boolean(message.getFlag(MOD_ID, "isMonitorMsg"));

  const gmUsers = game.users.filter(u => u.isGM).map(u => u.id);
  if (gmUsers.length === 0) return;

  const userName = escapeHTML(deletingUser.name || t("Chat.UnknownPlayer"));
  const alias = escapeHTML(message.alias || message.speaker?.alias || message.author?.name || t("Chat.UnknownSpeaker"));
  let entryText = "";
  if (isMonitor) {
    // <template> content is inert: parsing it does not fetch images (e.g. custom tracker icons)
    const tmp = document.createElement("template");
    tmp.innerHTML = message.content ?? "";
    entryText = escapeHTML((tmp.content.textContent ?? "").trim());
  }
  const whisperNames = (message.whisper ?? [])
    .map(id => escapeHTML(game.users.get(id)?.name ?? "?")).join(", ");
  const audience = whisperNames ? t("Chat.WhisperedTo", { users: whisperNames }) : t("Chat.Public");
  const time = new Date(message.timestamp ?? Date.now()).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const body = await getDeletedMessageBody(message);

  const summary = isMonitor
    ? t("Chat.DeletedChangelog", { user: userName, entry: entryText })
    : t("Chat.DeletedMessage", { user: userName, kind: describeDeletedMessage(message), speaker: alias });

  const content = `<details class="tm-deleted-details">`
    + `<summary class="tm-deleted-summary"><i class="fa-solid fa-trash"></i> `
    + `<span class="tm-deleted-text">${summary}</span>`
    + `<span class="tm-deleted-time">${escapeHTML(time)}</span></summary>`
    + `<div class="tm-deleted-meta">${alias} · ${audience} · ${escapeHTML(time)}</div>`
    + `<div class="tm-deleted-body">${body}</div></details>`;

  await ChatMessage.create({
    author: game.user.id,
    speaker: ChatMessage.getSpeaker({ user: game.user }),
    whisper: gmUsers,
    content,
    flags: { [MOD_ID]: { kind: "chat-delete" } }
  });
}

/** Whether a non-GM user is about to change a protected changelog message on this client. */
function isProtectedChangelog(message, userId) {
  if (game.user.isGM || userId !== game.user.id) return false;
  if (!getWorldBool("protectChangelogMessages", true)) return false;
  return Boolean(message.getFlag(MOD_ID, "isMonitorMsg"));
}

export function registerChatModeration() {
  Hooks.on("deleteChatMessage", (message, options, userId) => {
    reportDeletedMessage(message, options, userId).catch(err => {
      console.error(`[${MOD_ID}] Failed to report deleted chat message:`, err);
    });
  });

  // Players author their own changelog messages, so they own them. Changelog entries can't be used to hide
  // changes as long as players can't delete them or edit what they say.
  Hooks.on("preDeleteChatMessage", (message, options, userId) => {
    if (!isProtectedChangelog(message, userId)) return;
    ui.notifications.warn(t("Chat.OnlyGMDelete"));
    return false;
  });

  Hooks.on("preUpdateChatMessage", (message, change, options, userId) => {
    if (!isProtectedChangelog(message, userId)) return;
    // Flag keys may carry a deletion prefix, so match them loosely
    const touchesFlags = Object.keys(change.flags ?? {}).some(k => k.includes(MOD_ID));
    if (!touchesFlags && !PROTECTED_MESSAGE_FIELDS.some(f => foundry.utils.hasProperty(change, f))) return;
    ui.notifications.warn(t("Chat.OnlyGMEdit"));
    return false;
  });
}
