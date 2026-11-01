// Changelog chat messages: audience, batching and rendering.

import { MOD_ID, MESSAGE_FLUSH_MS } from "./constants.mjs";
import { adapter } from "./systems/index.mjs";
import { getSetting, getWorldBool } from "./settings.mjs";

// Outgoing chat messages, flushed in a single createDocuments call
const MESSAGE_QUEUE = [];

// Players ask the active GM to create their changelog messages (see createMessages)
const CREATE_QUERY = `${MOD_ID}.createMessages`;
const LINE_WRAPPER = /^<div class="tiny-monitor-line( tm-multiline)?">[\s\S]*<\/div>$/;
let messageFlushTimer = null;

/** User IDs to whisper a changelog message about this actor to. An empty list means a public message. */
export function buildRecipients(actor) {
  const gmIds = game.users.filter(u => u.isGM).map(u => u.id);
  const visibility = getSetting("messageVisibility", "gm-player") ?? "gm-player";

  if (visibility === "gm") {
    // GM only: whispered exclusively to GMs
    return gmIds;
  }

  if (visibility === "player") {
    // Player only: whispered to all non-GM players; GMs won't see it
    const nonGmIds = game.users.filter(u => !u.isGM).map(u => u.id);
    return nonGmIds.length > 0 ? nonGmIds : gmIds;
  }

  // GM + owning players
  const gmAndOwners = () => {
    const ids = new Set(gmIds);
    if (actor.testUserPermission) {
      for (const u of game.users) {
        if (!u.isGM && actor.testUserPermission(u, CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER)) ids.add(u.id);
      }
    }
    return [...ids];
  };

  // For NPCs, the NPC Message Audience setting further refines the audience.
  if (adapter.isNpc(actor)) {
    const npcMode = getSetting("npcAudience", "gm-owners") ?? "gm-owners";
    if (npcMode === "gm") return gmIds;
    // "gm-players" is the pre-14.13.6 value, until migrateSettings has run
    if (npcMode === "everyone" || npcMode === "gm-players") return [];
    return gmAndOwners();
  }

  // PC actors:
  // "everyone": public message visible to all players and GMs
  if (visibility === "everyone") {
    return [];
  }

  // "gm-player" (GM + Owners, default): whisper to GM and the player(s) owning the PC actor
  return gmAndOwners();
}

/**
 * Chat message data for a changelog line.
 * @param {string} line
 * @param {string} cls          CSS class that colours the message
 * @param {string} kind         What changed (stored as a flag)
 * @param {string[]} whisper    Recipients from buildRecipients
 * @param {object} [options]
 * @param {boolean} [options.multiline]  Allow the line to wrap to two lines
 * @param {string} [options.color]       Background colour (custom tracked values)
 */
function buildMessageData(line, cls, kind, whisper, { multiline = false, color = null } = {}) {
  const flags = { isMonitorMsg: true, kind, cls };
  if (color) flags.customColor = color;

  const msgData = {
    content: `<div class="tiny-monitor-line${multiline ? " tm-multiline" : ""}">${line}</div>`,
    flags: { [MOD_ID]: flags }
  };
  if (whisper.length > 0) msgData.whisper = whisper;
  return msgData;
}

/**
 * Queue chat message data. Messages queued within MESSAGE_FLUSH_MS of the first queued message
 * are created in a single createDocuments call, so bulk changes (level-ups, rests, dragging in
 * many items) cost one server round-trip instead of one per document.
 */
function queueMessage(msgData) {
  MESSAGE_QUEUE.push(msgData);
  messageFlushTimer ??= setTimeout(flushMessageQueue, MESSAGE_FLUSH_MS);
}

async function flushMessageQueue() {
  messageFlushTimer = null;
  if (!MESSAGE_QUEUE.length) return;
  const batch = MESSAGE_QUEUE.splice(0, MESSAGE_QUEUE.length);
  try {
    await createMessages(batch);
  } catch (err) {
    console.error(`[${MOD_ID}] Failed to create changelog messages:`, err);
  }
}

/**
 * Create changelog messages. A player's messages are created by the active GM (through a user query), so players
 * don't own them: they can't edit or delete them, and whispers to GMs only never reach the player's client.
 * Without an active GM, or without the permission to query users, the player creates them as before.
 * @param {object[]} batch
 */
async function createMessages(batch) {
  const gm = game.users.activeGM;
  if (!game.user.isGM && gm?.active && game.user.hasPermission("QUERY_USER")) {
    await gm.query(CREATE_QUERY, { messages: batch });
    return;
  }
  await ChatMessage.createDocuments(batch);
}

/**
 * Rebuild a requested changelog message from validated fields only, since the request comes from another client.
 * @param {object} msg   Message data from buildMessageData
 * @param {User} user    The requesting user, as reported by the server
 * @returns {object|null}  Null when the request is not a well-formed changelog message
 */
function validateRequest(msg, user) {
  const flags = msg?.flags?.[MOD_ID];
  if (typeof msg?.content !== "string" || !LINE_WRAPPER.test(msg.content) || flags?.isMonitorMsg !== true) return null;
  const kind = String(flags.kind ?? "");
  const cls = String(flags.cls ?? "");
  if (!/^[\w-]+$/.test(kind) || !/^tiny-monitor-[\w-]+$/.test(cls)) return null;

  const data = {
    content: foundry.utils.cleanHTML(msg.content),
    flags: { [MOD_ID]: { isMonitorMsg: true, kind, cls, requestedBy: user.id } }
  };
  if (typeof flags.customColor === "string" && /^#[0-9a-f]{3,8}$/i.test(flags.customColor)) {
    data.flags[MOD_ID].customColor = flags.customColor;
  }

  // A whisper whose recipients all vanished must not turn into a public message
  if (Array.isArray(msg.whisper) && msg.whisper.length) {
    data.whisper = msg.whisper.filter(id => game.users.has(id));
    if (!data.whisper.length) return null;
  }
  return data;
}

/** Query handler on the active GM: create the changelog messages a player requested. */
async function onCreateQuery(queryData, { user }) {
  if (!game.user.isActiveGM) throw new Error("Only the active GM creates changelog messages");
  const messages = (queryData?.messages ?? []).map(msg => validateRequest(msg, user)).filter(Boolean);
  if (messages.length) await ChatMessage.createDocuments(messages);
  return messages.length;
}

/**
 * @callback Emit
 * @param {string} line
 * @param {string} cls
 * @param {string} kind
 * @param {{multiline?: boolean, color?: string}} [options]
 */

/**
 * A function that posts changelog lines about one actor. Recipients are worked out once, on the first line.
 * Pass `whisper` when the recipients were already determined (e.g. before the document was deleted).
 * @param {Actor|null} actor
 * @param {string[]} [whisper]
 * @returns {Emit}
 */
export function createEmitter(actor, whisper = null) {
  return (line, cls, kind, options) => {
    whisper ??= buildRecipients(actor);
    queueMessage(buildMessageData(line, cls, kind, whisper, options));
  };
}

/** Post one changelog line about an actor. */
export function postMonitorMessage(actor, line, cls, kind, options) {
  createEmitter(actor)(line, cls, kind, options);
}

// -------------------------------
// Rendering
// -------------------------------

function shouldHideMessage(message) {
  const whisper = message.whisper ?? [];

  if (whisper.length > 0 && !whisper.includes(game.user.id)) {
    // Non-GMs who are not in the whisper list should never see the message. Only reaches a player who created
    // it themselves (no GM online, or messages from before 14.16.0).
    if (!game.user.isGM) return true;

    // GMs shouldn't see it if visibility is strictly "Player only"
    const visibility = getSetting("messageVisibility", "gm-player") ?? "gm-player";
    if (visibility === "player") return true;
  }

  return false;
}

function applyMonitorStyling(message, html) {
  const li = html.closest(".chat-message") ?? html;
  if (message.getFlag(MOD_ID, "kind") === "chat-delete") {
    li.classList.add("tm-deleted");
    return;
  }
  if (!message.getFlag(MOD_ID, "isMonitorMsg")) return;

  if (shouldHideMessage(message)) {
    li.classList.add("tm-hidden");
    return;
  }

  li.classList.add("tiny-monitor-msg");
  const cls = message.getFlag(MOD_ID, "cls");
  if (cls) li.classList.add(cls);

  const customColor = message.getFlag(MOD_ID, "customColor");
  if (customColor) li.style.setProperty("--tm-line-bg", customColor);

  if (getWorldBool("compactMessages", true)) li.classList.add("tm-compact");
}

/**
 * Core always scrolls to the bottom for messages authored by the current user, which yanks the chat down
 * when someone scrolled up to click a damage button. For changelog messages, only scroll if already at the bottom.
 * Uses libWrapper when it is active, otherwise wraps the method directly. The wrapper only changes the `scroll`
 * option and passes everything on, so other wrappers of postOne keep working.
 */
function patchChatScroll() {
  const ChatLog = foundry.applications?.sidebar?.tabs?.ChatLog;
  if (!ChatLog?.prototype?.postOne) return;

  function postOne(wrapped, message, options = {}) {
    if (options.scroll === undefined && message?.flags?.[MOD_ID] && !this.isAtBottom) {
      options = { ...options, scroll: false };
    }
    return wrapped(message, options);
  }

  if (game.modules.get("lib-wrapper")?.active && globalThis.libWrapper) {
    globalThis.libWrapper.register(MOD_ID, "foundry.applications.sidebar.tabs.ChatLog.prototype.postOne", postOne, "WRAPPER");
    return;
  }
  const original = ChatLog.prototype.postOne;
  ChatLog.prototype.postOne = function (message, options) {
    return postOne.call(this, original.bind(this), message, options);
  };
}

export function registerMessages() {
  CONFIG.queries[CREATE_QUERY] = onCreateQuery;
  Hooks.on("renderChatMessageHTML", applyMonitorStyling);
  patchChatScroll();
}
