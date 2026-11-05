// Changelog chat messages: audience, batching, merging and rendering.

import { MOD_ID, MESSAGE_FLUSH_MS } from "./constants.mjs";
import { adapter } from "./systems/index.mjs";
import { getSetting, getWorldBool } from "./settings.mjs";
import { formatLine, getActorLink } from "./utils.mjs";
import { t } from "./i18n.mjs";

/**
 * What a changelog line means; it decides the colour. "custom" lines carry their own colour.
 * @typedef {"gain"|"loss"|"spend"|"currency"|"neutral"|"custom"} Tone
 */
const TONES = new Set(["gain", "loss", "spend", "currency", "neutral", "custom"]);

// Messages from before 14.17.0 stored a CSS class per kind of change instead of a tone
const LEGACY_TONES = {
  "tiny-monitor-gain": "gain", "tiny-monitor-loss": "loss",
  "tiny-monitor-temp": "neutral", "tiny-monitor-tempmax": "neutral",
  "tiny-monitor-currency-gain": "currency", "tiny-monitor-currency-loss": "currency",
  "tiny-monitor-spellslot-expend": "spend", "tiny-monitor-spellslot-regain": "gain",
  "tiny-monitor-spellprep": "neutral", "tiny-monitor-inspiration": "gain",
  "tiny-monitor-hitdice-expend": "spend", "tiny-monitor-hitdice-regain": "gain",
  "tiny-monitor-item-inc": "gain", "tiny-monitor-item-dec": "loss", "tiny-monitor-item": "neutral",
  "tiny-monitor-equip": "neutral", "tiny-monitor-unequip": "neutral",
  "tiny-monitor-effect-add": "gain", "tiny-monitor-effect-remove": "loss",
  "tiny-monitor-effect-enable": "gain", "tiny-monitor-effect-disable": "loss",
  "tiny-monitor-xp-gain": "gain", "tiny-monitor-xp-loss": "loss",
  "tiny-monitor-ability-gain": "gain", "tiny-monitor-ability-loss": "loss",
  "tiny-monitor-omens-gain": "gain", "tiny-monitor-omens-loss": "spend",
  "tiny-monitor-custom": "custom"
};

/**
 * Changes that are merged into one message per actor and audience when they happen together (e.g. swapping spells
 * on a level-up). Entries are added ("+") or removed ("-"). With only one direction the message is one line
 * ("added Alert, Suggestion"); with both, a summary line ("Items +2 −1") and one row per direction.
 */
const GROUPS = {
  items: { icon: "backpack", kind: "item", label: "Line.Items", added: "Line.ItemAdded", removed: "Line.ItemDeleted" },
  spells: {
    icon: "book-open", kind: "spellprep", label: "Line.Spells", added: "Line.SpellsPrepared", removed: "Line.SpellsUnprepared",
    // "+ Suggestion" would not say whether it was prepared, so the rows keep the verb
    neutral: true, rowText: true
  },
  effects: { icon: "sparkles", kind: "effect", label: "Line.Effects", added: "Line.EffectGained", removed: "Line.EffectLost" }
};

// Players ask the active GM to create their changelog messages (see createMessages)
const CREATE_QUERY = `${MOD_ID}.createMessages`;
const ENTRY_WRAPPER = /^<div class="tm-entry">[\s\S]*<\/div>$/;

// Lines and group entries waiting to be created in a single batch
const QUEUE = [];
let flushTimer = null;

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
 * Chat message data for a changelog entry.
 * @param {string} line        The first line, from formatLine
 * @param {Tone} tone
 * @param {string} kind        What changed (stored as a flag, read by other modules)
 * @param {string[]} whisper   Recipients from buildRecipients
 * @param {object} [options]
 * @param {string} [options.color]  Colour of a "custom" line
 * @param {string} [options.rows]   Further rows of a merged message
 */
function buildMessageData(line, tone, kind, whisper, { color = null, rows = "" } = {}) {
  const flags = { isMonitorMsg: true, kind, tone };
  if (color) flags.customColor = color;
  const msgData = {
    content: `<div class="tm-entry"><div class="tiny-monitor-line">${line}</div>${rows ? `<div class="tm-rows">${rows}</div>` : ""}</div>`,
    flags: { [MOD_ID]: flags }
  };
  if (whisper.length > 0) msgData.whisper = whisper;
  return msgData;
}

/** Turn the merged entries of one group, actor and audience into one message. */
function buildGroupMessage(group) {
  const def = GROUPS[group.group];
  const added = group.entries.filter(e => e.sign === "+").map(e => e.html);
  const removed = group.entries.filter(e => e.sign !== "+").map(e => e.html);
  const describe = (key, items) => t(key, { items: items.join(", ") });

  // One direction only: a single line
  if (!added.length || !removed.length) {
    const isAdded = added.length > 0;
    const line = formatLine({ icon: def.icon, actor: group.actorLink, text: describe(isAdded ? def.added : def.removed, isAdded ? added : removed) });
    const tone = def.neutral ? "neutral" : (isAdded ? "gain" : "loss");
    return buildMessageData(line, tone, def.kind, group.whisper);
  }

  // Both: a summary line and a row per direction
  const delta = `<span class="tm-gain">+${added.length}</span> <span class="tm-loss">−${removed.length}</span>`;
  const row = (cls, sign, key, items) => `<div class="tm-row tm-${cls}"><span class="tm-sign">${sign}</span>`
    + `${def.rowText ? describe(key, items) : items.join(", ")}</div>`;
  const rows = row("gain", "+", def.added, added) + row("loss", "−", def.removed, removed);
  const line = formatLine({ icon: def.icon, actor: group.actorLink, text: t(def.label), delta });
  return buildMessageData(line, "neutral", def.kind, group.whisper, { rows });
}

/** Message data for everything queued, with group entries merged per group, actor and audience. */
function buildBatch(entries) {
  const out = [];
  const groups = new Map();
  for (const entry of entries) {
    if (!entry.group) {
      out.push(buildMessageData(entry.line, entry.tone, entry.kind, entry.whisper, { color: entry.color }));
      continue;
    }
    const key = `${entry.group}|${entry.actorUuid}|${entry.whisper.join(",")}`;
    let group = groups.get(key);
    if (!group) {
      // The merged message takes the place of the group's first entry
      group = { group: entry.group, actorLink: entry.actorLink, whisper: entry.whisper, entries: [] };
      groups.set(key, group);
      out.push(group);
    }
    group.entries.push(entry);
  }
  return out.map(item => (item.entries ? buildGroupMessage(item) : item));
}

/**
 * Queue an entry. Entries queued within MESSAGE_FLUSH_MS of the first one are created in a single createDocuments
 * call, so bulk changes (level-ups, rests, dragging in many items) cost one server round-trip, and group entries
 * of the same actor can be merged.
 */
function queueEntry(entry) {
  QUEUE.push(entry);
  flushTimer ??= setTimeout(flushQueue, MESSAGE_FLUSH_MS);
}

async function flushQueue() {
  flushTimer = null;
  if (!QUEUE.length) return;
  try {
    await createMessages(buildBatch(QUEUE.splice(0, QUEUE.length)));
  } catch (err) {
    console.error(`[${MOD_ID}] Failed to create changelog messages:`, err);
  }
}

/**
 * Run this client's preCreateChatMessage hooks for a message the GM will create. Modules that hide changelog
 * messages in that hook (e.g. while summarizing a rest) keep their state on the client where the change happens,
 * which no longer creates the message itself.
 */
function passesLocalHooks(data) {
  const doc = new ChatMessage.implementation(data);
  return Hooks.call("preCreateChatMessage", doc, data, {}, game.user.id) !== false;
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
    const messages = batch.filter(passesLocalHooks);
    if (messages.length) await gm.query(CREATE_QUERY, { messages });
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
  if (typeof msg?.content !== "string" || !ENTRY_WRAPPER.test(msg.content) || flags?.isMonitorMsg !== true) return null;
  const kind = String(flags.kind ?? "");
  const tone = String(flags.tone ?? "");
  if (!/^[\w-]+$/.test(kind) || !TONES.has(tone)) return null;

  const data = {
    content: foundry.utils.cleanHTML(msg.content),
    flags: { [MOD_ID]: { isMonitorMsg: true, kind, tone, requestedBy: user.id } }
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
 * Posts changelog lines about one actor. Recipients are worked out once, on the first line.
 * @callback Emit
 * @param {string} line   From formatLine
 * @param {Tone} tone
 * @param {string} kind
 * @param {{color?: string}} [options]
 */

/**
 * A function that posts changelog lines about one actor; `emit.group(group, sign, html)` adds an entry that is
 * merged with other entries of the same group (see GROUPS).
 * @param {Actor|{uuid: string, link: string}} target  The actor, or its UUID and link once it may be gone
 * @param {string[]} [whisper]  Recipients, when already determined (e.g. before the document was deleted)
 * @returns {Emit & {group: (group: string, sign: "+"|"-", html: string) => void}}
 */
export function createEmitter(target, whisper = null) {
  const recipients = () => (whisper ??= buildRecipients(target));
  const emit = (line, tone, kind, { color = null } = {}) => queueEntry({ line, tone, kind, color, whisper: recipients() });
  emit.group = (group, sign, html) => queueEntry({
    group, sign, html,
    actorUuid: target?.uuid ?? null,
    actorLink: target instanceof Actor ? getActorLink(target) : (target?.link ?? ""),
    whisper: recipients()
  });
  return emit;
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

/**
 * Give a line from before 14.17.0 the current structure, so it lays out like new lines (icon gap).
 * Old lines are either `<i> <span.tm-actor> <span.tm-text>` or, for items and effects, `<i> link text` without spans.
 */
function upgradeLegacyLine(line) {
  if (line.querySelector(":scope > .tm-icon")) return;
  line.classList.remove("tm-multiline");
  const wrap = (cls, nodes) => {
    const span = document.createElement("span");
    span.className = cls;
    span.append(...nodes);
    return span;
  };
  const icon = line.querySelector(":scope > i");
  if (icon) icon.replaceWith(wrap("tm-icon", [icon.cloneNode(true)]));
  if (line.querySelector(":scope > .tm-text")) return;

  // Unstructured line: the first link is the actor, everything after it is the text
  const nodes = [...line.childNodes].filter(n => !(n instanceof Element && n.classList.contains("tm-icon")));
  const actorIndex = nodes.findIndex(n => n instanceof Element && n.matches("a.content-link"));
  const actor = actorIndex >= 0 ? nodes[actorIndex] : null;
  const rest = actor ? nodes.slice(actorIndex + 1) : nodes;
  if (actor) line.append(" ", wrap("tm-actor", [actor]));
  line.append(" ", wrap("tm-text", rest));
  for (const node of nodes.slice(0, Math.max(actorIndex, 0))) node.remove();
}

/** A message's time ("08:19"), with the date for messages from an earlier day. */
function formatTime(timestamp) {
  const date = new Date(timestamp);
  const time = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (date.toDateString() === new Date().toDateString()) return time;
  return `${date.toLocaleDateString()} ${time}`;
}

const MESSAGE_STYLES = new Set(["tinted", "solid", "accent"]);

/** The Message Style setting; how changelog lines are coloured. */
function getMessageStyle() {
  const style = getSetting("messageStyle", "tinted");
  return MESSAGE_STYLES.has(style) ? style : "tinted";
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

  li.classList.add("tiny-monitor-msg", `tm-style-${getMessageStyle()}`);
  const tone = message.getFlag(MOD_ID, "tone");
  li.dataset.tone = TONES.has(tone) ? tone : (LEGACY_TONES[message.getFlag(MOD_ID, "cls")] ?? "neutral");
  const customColor = message.getFlag(MOD_ID, "customColor");
  if (customColor) li.style.setProperty("--tm-tone", customColor);
  if (getWorldBool("compactMessages", true)) li.classList.add("tm-compact");

  const line = li.querySelector(".tiny-monitor-line");
  if (line) upgradeLegacyLine(line);

  // Time as a tooltip left of the chat log (see patchTooltipAnchor), so it takes no room in the line. Links without a
  // direction of their own open their tooltips to the left as well.
  if (message.timestamp) {
    li.dataset.tooltipText = formatTime(message.timestamp);
    li.dataset.tooltipDirection = "LEFT";
  }

  // Merged messages open on keyboard focus or tap as well as on hover
  if (li.querySelector(".tm-rows")) li.tabIndex = 0;

  // Actor links would only show their type ("Character Actor") as a tooltip, which dnd5e restyles into unreadable
  // dark-on-dark text. Without data-tooltip (V14) / data-tooltip-text (V13) core shows none; the aria-label stays for
  // screen readers. Item links keep theirs (dnd5e shows an item preview).
  for (const link of li.querySelectorAll('a.content-link[data-type="Actor"]')) {
    delete link.dataset.tooltip;
    delete link.dataset.tooltipText;
  }
}

/**
 * Apply the Message Style and Compact Messages settings to changelog messages already shown, so changing either
 * setting takes effect at once on every client. Messages rendered later read the settings themselves.
 */
function restyleShownMessages() {
  const style = getMessageStyle();
  const compact = getWorldBool("compactMessages", true);
  // V14 can show the chat in detached windows; V13 only has this document
  const selector = "li.chat-message.tiny-monitor-msg";
  const messages = foundry.applications.detached?.querySelectorAll?.(selector) ?? document.querySelectorAll(selector);
  for (const li of messages) {
    li.classList.remove(...[...li.classList].filter(cls => cls.startsWith("tm-style-")));
    li.classList.add(`tm-style-${style}`);
    li.classList.toggle("tm-compact", compact);
  }
}

/** Restyle shown messages when a setting that changes their look is saved (world settings: on every client). */
function onStyleSettingChange(setting) {
  if ([`${MOD_ID}.messageStyle`, `${MOD_ID}.compactMessages`].includes(setting?.key)) restyleShownMessages();
}

/**
 * Wrap a core method: through libWrapper when it is active, otherwise directly. The wrappers only adjust arguments or
 * the result for changelog messages and call the original, so other wrappers of the same method keep working.
 * @param {string} path  Dotted path of the method from globalThis
 * @param {(wrapped: Function, ...args) => *} wrapper
 */
function wrapMethod(path, wrapper) {
  if (game.modules.get("lib-wrapper")?.active && globalThis.libWrapper) {
    globalThis.libWrapper.register(MOD_ID, path, wrapper, "WRAPPER");
    return;
  }
  const split = path.lastIndexOf(".");
  const owner = foundry.utils.getProperty(globalThis, path.slice(0, split));
  const name = path.slice(split + 1);
  const original = owner?.[name];
  if (typeof original !== "function") return;
  owner[name] = function (...args) {
    return wrapper.call(this, original.bind(this), ...args);
  };
}

/**
 * Core always scrolls to the bottom for messages authored by the current user, which yanks the chat down
 * when someone scrolled up to click a damage button. For changelog messages, only scroll if already at the bottom.
 */
function patchChatScroll() {
  wrapMethod("foundry.applications.sidebar.tabs.ChatLog.prototype.postOne", function (wrapped, message, options = {}) {
    if (options.scroll === undefined && message?.flags?.[MOD_ID] && !this.isAtBottom) {
      options = { ...options, scroll: false };
    }
    return wrapped(message, options);
  });
}

/**
 * Tooltips that open to the left of a link (e.g. dnd5e's item previews) or of a changelog message (its time) cover the
 * chat log. For those, anchor them to the left edge of the sidebar (or chat popout) instead; the vertical position
 * still follows the link or message.
 */
function patchTooltipAnchor() {
  wrapMethod("foundry.helpers.interaction.TooltipManager.prototype._setAnchor", function (wrapped, direction) {
    const container = this.element?.closest?.(".tiny-monitor-msg")?.closest("#sidebar, .chat-popout, #chat-notifications");
    const result = wrapped(direction);
    if (!container || direction !== this.constructor.TOOLTIP_DIRECTIONS.LEFT) return result;
    const pad = this.constructor.TOOLTIP_MARGIN_PX;
    const link = this.element.getBoundingClientRect();
    const { innerWidth } = this.tooltip.ownerDocument.defaultView;
    return this._setStyle({
      textAlign: "left",
      right: innerWidth - container.getBoundingClientRect().left + pad,
      top: link.top + (link.height / 2) - (this.tooltip.offsetHeight / 2)
    });
  });
}

export function registerMessages() {
  CONFIG.queries[CREATE_QUERY] = onCreateQuery;
  Hooks.on("renderChatMessageHTML", applyMonitorStyling);
  // Registered after the settings cache hooks (settings.mjs, at import), so the cache is already cleared here
  Hooks.on("createSetting", onStyleSettingChange);
  Hooks.on("updateSetting", onStyleSettingChange);
  patchChatScroll();
  patchTooltipAnchor();
}
