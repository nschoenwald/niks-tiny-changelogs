# Changelog

All notable changes to this project will be documented in this file.

## 14.17.0

### Added
- **New Look for Changelog Messages**: Lines are calmer and easier to scan. Each shows an icon, the actor, what changed, the change itself in bold (e.g. "−6") and the old and new value (e.g. "10 → 4"). Five colours show what a change means: gains, losses, spent resources, currency and neutral changes. Text keeps your chat card's colours, so it stays readable in light and dark chat.
- **Combined Messages**: Items added and removed together, spells prepared together and effects gained or lost together now post one message per actor instead of one per change. A level-up that swaps spells and feats shows up as "Items +3 −4", with the added and removed items listed below.
- **Message Style**: A new setting to choose how changelog messages are coloured; changing it restyles the messages already in the chat right away. *Tinted* (default) keeps your system's chat card, including D&D 5e's paper texture, with a light tint and a coloured stripe. *Solid* fills the line with its colour. *System card* only adds a coloured stripe.
- **Item Links**: Item names in changelog messages are now links to the item. Their previews (e.g. D&D 5e's item cards) open to the left of the sidebar instead of covering the chat log.
- **Time on Hover**: Hovering a changelog message shows when it happened.

### Improved
- **Compact Messages**: Compact messages now also expand on keyboard focus or tap, so they work on touch screens. Turning the setting on or off now applies to the messages already in the chat right away, without a reload.
- **Simplified Output**: Now hides the old and new value and keeps the change (e.g. "+5").
- **Older Messages**: Changelog messages from earlier versions are shown in the new look as well.

### Fixed
- **Short Rest Summaries (Nik's D&D 5e Tweaks)**: Since 14.16.0, a player's short rest showed the individual HP and Hit Dice messages next to the rest summary. Modules that hide changelog messages on the player's side work again.
- **Solid Colours in D&D 5e**: Changelog text could take D&D 5e's dark chat text colour on a coloured line.
- **Actor Tooltips**: Hovering an actor name in a changelog message no longer shows a tooltip. It only said "Character Actor" and appeared as an empty dark box with some UI modules. Item names keep their tooltips, such as D&D 5e's item preview.

## 14.16.0

### Added
- **Demonlord**: Changes to Gold Crowns, Silver Shillings, Copper Pennies and Bits are now logged, as are talent uses and spell castings.
- **PF2e**: Coins are now logged as currency (e.g. "Gold: 12 + 8 → 20"), including new and removed coin stacks, and uses of consumables are logged.
- **Shadowdark**: Uses of class abilities with limited uses are now logged.
- **libWrapper**: When libWrapper is active, the module uses it for its chat scrolling tweak.
- **Translations**: All text now comes from a language file, so the module can be translated.

### Improved
- **Changelog Messages Created by the GM**: Changelog messages about a player's changes are now created by the GM. Players can no longer edit or delete them in any way, and messages meant for the GM only never reach the player's game. When no GM is online, players create the messages themselves as before.
- **Custom Tracked Values Storage**: Custom tracked values are stored in a new format. Existing ones are moved over automatically the first time a GM logs in, and older export files can still be imported.
- **Changelog Colours**: Changelog messages now always keep their colour, even when core or system chat styles give chat messages a parchment or card background.
- **Dark Theme**: The Import / Export and Custom Tracked Values windows are now easier to read with the dark Applications theme.
- **Tooltips**: The module no longer changes the colours of any tooltips, so tooltips from other modules and systems look as intended.
- **Under the Hood**: The module's code was reorganised to make it easier to maintain and extend. Changelog messages look the same as before.

### Fixed
- **Protect Changelog Messages**: Players can no longer edit the text of changelog messages, only GMs can. Previously a player could change what an entry said even though they couldn't delete it.
- **NPC Message Audience**: Now applies to Shadowdark NPCs, Demonlord creatures, and Mörk Borg creatures and followers. Previously these were treated like player characters.
- **Shadowdark**: Light sources dropped on the scene no longer post item messages. Every player owns them, so those messages went to everyone.
- **Demonlord / Mörk Borg**: Demonlord vehicles and Mörk Borg containers and misery trackers are no longer tracked.
- **Demonlord**: Equip / Unequip tracking now follows whether an item is worn.

## 14.15.1

### Improved
- **Mörk Borg**: Ability and Omen messages now have their own background colours instead of being hard to read.
- **Demonlord**: Changes to maximum health are now labelled "Max Health" instead of "Temp Max".
- **DnD5e Hit Dice**: Hit Dice messages now use their own orange colours, so they're easier to tell apart from HP changes.
- **Settings Import**: An invalid value in an imported file is now skipped with a warning instead of stopping the import halfway.
- **Window Framework Modernization**: The Custom Tracked Values and Import / Export windows were updated to Foundry's current window framework. They look and work the same.
- **Foundry V13 Compatibility**: Removed a deprecation warning that appeared in the console on V13.

### Fixed
- **Shadowdark**: HP and coin (gold, silver, copper) changes are now tracked. Previously the module looked in the wrong place and logged nothing.
- **Active Effects**: Adding, removing, enabling or disabling an effect on an item (for example a spell's effect meant for its targets, or an enchantment) no longer shows up as the actor gaining or losing that effect.
- **Item Changes**: A Hit Dice change or spell preparation change no longer hides other changes made to the same item at the same time (e.g. a rename).
- **Custom Tracked Values**:
  - Trackers imported with missing fields (icon, messages) no longer break changelog messages. Missing fields fall back to defaults.
  - Importing settings while the Custom Tracked Values window is open now updates that window, so clicking Save there no longer undoes the import.
  - Names and messages containing special characters (such as `<` or `$`) are now displayed correctly.
- **Ignored Names / Blacklist**: Regular expressions containing commas (e.g. `/a{1,3}/`) now work.
- **Actor Names**: Actor or token names containing `{`, `}` or HTML characters no longer break the actor link in messages.

## 14.15.0

### Improved
- **Performance & Batching**: Bulk changes such as level-ups, rests, deleting a class, or adding/removing many items or effects at once now post their changelog messages together in one batch, reducing network traffic and chat lag for everyone at the table.
- **Update Filtering**: Updates that can't affect anything the module tracks (e.g. other modules saving their own data on an actor) are now ignored immediately.
- **Settings Cache**: Module settings are now cached instead of being looked up on every change and every chat message.

### Fixed
- **Multi-Actor Operations**: When several actors are updated in a single operation (e.g. by macros or other modules), each actor's changes are now reported with that actor's own previous values.
- **Item Value Stash**: An item edit that doesn't actually change anything can no longer cause a later change to that item to be reported with outdated values.
- **Deleted Item Names**: Deleted item names are now displayed safely, like all other item names.
- **Ignore-List Regex Flag**: Ignore-list regex patterns using the `g` flag no longer fail on every other check.

## 14.14.3

### Fixed
- **Chat Scroll Jump**: When you scroll up in chat to apply damage (or otherwise change an actor) from an older chat card, the resulting changelog message no longer yanks the chat log back down to the bottom. If you're already at the bottom, new changelog messages still scroll into view as before.

## 14.14.2

### Added
- **Container Currency Tracking**:
  - Changing currency within containers (such as backpacks, pouches, chests, or bags of holding) now produces changelog messages just like character currency.
  - Supports direct container sheet edits, conversions via Currency Manager, and transfers between characters and containers.
  - Clearly identifies both the character and container (e.g. `Gimli (Backpack) Gold: 0 + 50 → 50`), styled with standard currency gain and loss color badges.
  - Fully governed by the **Track Currency** setting and respects the **Ignored Names / Blacklist** filter.
- **Protect Changelog Messages**: Added a new world setting (enabled by default) so players can no longer delete changelog messages (e.g. to hide HP gains from the GM). GMs can still delete them.

### Improved
- **Deleted Message Notices Redesign**:
  - Messages deleted by players are now whispered to the GM(s) as a compact one-line summary (who deleted what, from whom) with an expander revealing the original speaker, audience, time and full content.
  - Notices are fresh base messages instead of monitor-styled clones, fixing clipped/unreadable cards, hidden speaker info, and dynamic DnD5e cards overwriting the notice.
  - Chat log flushes and deletion notices no longer produce notices. Deleted changelog entries are still reported (with their text in the summary) so players can't hide changes by deleting them.
- **Localized Currency Labels**: Currency denominations in DnD5e now automatically prioritize the active language's localized labels (e.g., in non-English games or custom translations).
- **Decimal Precision & Performance**: Cleaned up fractional currency calculations to avoid floating-point display artifacts, eliminated idle timeouts on untracked item modifications, and hardened rename logs with full HTML escaping.

## 14.14.1

### Fixed
- **Actor Name Tooltip (Foundry V14 / DnD5e 6.x)**:
  - Fixed an issue where hovering over actor names in changelog messages displayed a blank/black tooltip box.
  - In DnD5e 6.x and Foundry V14, `.theme-light` was applied to `#tooltip` upon hovering content links, which caused standard document links lacking rich tooltip styling (such as actors) to render dark text on a dark background. Added a CSS rule ensuring non-rich tooltips (`#tooltip:not(.dnd5e-tooltip)`) always retain high-contrast light text.

## 14.14.0

### Added
- **Pact Magic Spell Slots**: Added tracking for Warlock Pact Magic spell slots (`system.spells.pact.value`), reporting expenditure and recovery alongside standard level 1–9 slots.

### Improved
- **Modern Spell Preparation Tracking**: Updated spell preparation tracking to evaluate modern numeric preparation states (`system.prepared`) used in DnD5e 5.x and 6.0 (`0` = unprepared, `1` = prepared, `2` = always prepared), while preserving backwards compatibility for legacy preparation modes.
- **Hit Dice Denomination Support**: Updated Hit Dice tracking to read `system.hd.denomination` introduced in recent DnD5e versions, accurately reporting specific die sizes (e.g., `d8`, `d10`) instead of generic labels.
- **ActiveEffect v2 Resolution**: Added support for checking `effect.target` when resolving effect actors, ensuring seamless compatibility with Foundry V14 and DnD5e 6.0 ActiveEffect v2 models.

### Fixed
- **Dynamic Chat Message Deletion Tracking**: Hardened deleted message tracking for DnD5e 6.0's dynamic chat cards (`type: "usage"`, `"attack"`, etc.) by storing deletion notices in the message flavor header so that dynamic card template re-rendering does not overwrite the deletion notice.

## 14.13.6

### Added
- **Everyone Visibility Option**: Added an **Everyone** (`everyone`) option with public broadcast behavior, allowing changelog messages to be posted as open chat messages visible to all players and GMs.

### Improved
- **Message Visibility Default Behavior**: The default **GM + Owners** (`gm-player`) setting for **Message Visibility** now whispers changelog messages strictly to the GM and the player(s) owning the character, ensuring other players do not see changes to characters they do not control.
- **Unified Visibility Settings & Options**:
  - Unified the naming of options (*GM only*, *GM + Owners*, *Everyone*, *Player only*) across both **Message Visibility** and **NPC Message Audience**.
  - Harmonized tooltips and descriptions across both settings to clearly explain delivery targets and how NPC audience filtering interacts with global visibility.
  - Added automatic migration for legacy NPC audience configurations (`gm-players` → `everyone`).

## 14.13.5

### Fixed
- **Settings Import Window State**: After a successful settings import, the Foundry settings window and the import/export dialog are now properly closed so that stale values are no longer displayed.
- **Settings Sidebar Crash**: Fixed a crash that emptied the settings sidebar, caused by an unsafe `instanceof SettingsConfig` check that throws in Foundry V13+ (where `SettingsConfig` is an `ApplicationV2` class, not a global). Now uses safe constructor-name string checks and snapshots app collections before iterating to avoid mutation-during-iteration issues.

## 14.13.0

### Added
- **Settings Import / Export**:
  - Export all module settings and custom tracked resource configurations into a clean, portable JSON file for easy backup or transfer across worlds.
  - Dedicated **Import / Export Settings** configuration menu in Foundry's Module Settings tab.
  - Supports importing settings with a preview confirmation dialog detailing found module settings and custom tracker configurations.
  - Flexible **Custom Trackers Handling** during import: choose to **Replace** all existing custom trackers or **Merge** them with existing definitions (avoiding duplicate paths).
  - Added dedicated **Export Trackers** and **Import Trackers** actions directly inside the **Custom Tracked Values** dialog for fast, localized management of custom tracker presets.

## 14.12.1

### Fixed
- **Message Visibility Whisper Leak**: Fixed an issue where player clients would still see changelog messages in their chat log for actions they performed even when **Message Visibility** was set to **GM only** (caused by Foundry's default behavior of showing outgoing whispers to their author). Unauthorized whisper recipients are now fully suppressed from chat rendering.

## 14.12.0

### Added
- **Ignored Names / Blacklist**: Added world setting to filter out specific items, Active Effects, and custom resources from being reported in changelogs.
  - Supports comma-separated or newline-separated lists of names (case-insensitive, e.g. `Aura of Protection, Torch`).
  - Supports wildcards (`*` and `?`, e.g. `Aura of *` to ignore all paladin auras).
  - Supports regular expressions (e.g. `/^aura of/i`).
  - Evaluates changes across item additions, deletions, updates, equip/unequip, Active Effects, D&D 5e spell preparation, and custom tracked resources.

## 14.11.0

### Added
- **Message Visibility Setting**: Added world setting to control who sees changelog messages globally: **GM only** (whispered exclusively to GMs), **Player and GM** (public message, default), or **Player only** (whispered to all non-GM players; GMs will not see it in their chat). The existing *Whisper Target* and *NPC Message Audience* settings now act as refinements that only apply when Visibility is set to *Player and GM*.

## 14.10.0

### Improved
- **Performance Optimizations**:
  - **Batch Message Creation**: Combined multi-attribute change notifications (e.g. HP, currency, spell slots) into single document batch operations (`ChatMessage.createDocuments`), reducing network and database overhead.
  - **Custom Tracked Resources Cache**: Cached parsed custom tracked resources in memory, eliminating redundant JSON parsing on every actor update.
  - **String Escaping & DOM Optimization**: Replaced DOM element creation in string escaping with native `foundry.utils.escapeHTML`.
  - **Actor Name Resolution**: Streamlined actor link generation to avoid unnecessary spatial canvas token queries.
  - **Active Effect Lookup**: Optimized active effect parent resolution to constant time using direct document properties instead of searching world actors.
  - **System Adapter Early Guards**: Added property existence guards in system adapters (such as D&D 5e spell slot tracking) to skip unnecessary path evaluations.
  - **CSS Containment & Render Hooks**: Added CSS layout containment (`contain: content`) to isolate chat message rendering and optimized render hook registration for Foundry V13/V14.

## 14.9.3

### Fixed
- **D&D 5e Tracking**: Fixed tracking for spell slots, death saves, and XP payload keys following adapter refactoring (thanks to [@zxlit](https://github.com/zxlit) in [#10](https://github.com/nschoenwald/niks-tiny-changelogs/pull/10)!).

## 14.9

### Added
- **Custom Tracked Values**: You can now configure any arbitrary actor data path to be tracked complete with customizable gain/loss messages, icons, and message colors. Configure this via the new dedicated submenu in the module settings. This is meant for advanced users.

## 14.8.2

### Added
- **Mörk Borg System Support**: Added support for the **Mörk Borg** game system (thanks to [@HectorCastelli](https://github.com/HectorCastelli)!), including:
  - **HP** tracking via `system.hp.value`.
  - **Attributes** tracking (increase/decrease), with a dedicated **Track Attributes** setting.
  - **Omens** tracking (gain/spend), with a dedicated **Track Omens** setting.
  - **Powers** tracking (use/recover), with a dedicated **Track Powers** setting.
  - **Silver** currency tracking via the existing **Track Currency** setting.

### Improved
- **Architecture Overhaul (System Adapter Pattern)**: Completely refactored the module into a **System Adapter Pattern**. 
  - System-specific logic is no longer hardcoded into the main script.
  - Added dedicated adapters for **D&D 5e**, **Pathfinder 2e**, **Shadowdark**, **Shadow of the Demon Lord**, and **Mörk Borg**.
  - New systems can now be easily integrated without cluttering the core functionality.
  - Settings are dynamically registered so that only the configuration relevant to your active game system is displayed.

## 14.7

### Added
- **Compact Messages**: Added world setting (enabled by default). Changelog messages are limited to a single line and smoothly expand on hover, keeping the chat log tidy.

## 14.6

### Added
- **Whisper Target**: Added world setting to control who receives changelog messages: GM + Player (default), Player only, GM only, or Everyone.

## 14.5

### Added
- **Experience Points Tracking (DnD5e)**: Added the **Track Experience Points (DnD5e)** setting (`trackDnd5eXP`) to log when a character gains or loses XP (`system.details.xp.value`), styled with dedicated color badges.

## 14.4

### Added
- **Equip / Unequip Tracking**: Added the **Track Equip / Unequip** setting (`trackEquip`) to log when items are equipped or unequipped on an actor.
- **Active Effect Tracking**: Added the **Track Active Effects** setting (`trackActiveEffects`) to monitor and log when Active Effects are added, removed, enabled, or disabled on an actor (supporting both direct and transferred item effects).

## 14.3.4

### Improved
- **Foundry V14 Chat Message Layout**: Applied a CSS grid reset (`display: grid !important`, `grid-template-columns: 1fr !important`) and hidden avatar elements to eliminate layout ghosting and empty column gaps on chat cards in Foundry V14.

## 14.3.2

### Added
- **Limited Item Uses Tracking**: Added monitoring for item limited uses, logging when an item with limited uses spends or regains uses (`system.uses.spent` vs `system.uses.max`).

## 14.3.1

### Fixed
- **DnD5e Spell Preparation Detection**: Updated spell preparation checks to read modern `system.preparation.mode` and `system.preparation.prepared` properties with fallbacks for legacy data structures.

## 14.3

### Added
- **Hit Dice Tracking (DnD5e)**: Added the **Track Hit Dice (DnD5e)** setting (`trackDnd5eHitDice`) to log when characters expend or regain Hit Dice with custom orange badges, supporting both modern `system.hd.spent` and legacy `system.hitDiceUsed`.

### Improved
- **Item Rename Output**: Cleaned up item rename messages by removing the redundant `Item:` prefix.

## 14.2

### Improved
- **Spell Preparation Debouncing**: Integrated DnD5e spell preparation updates into the item debounce pipeline, preventing duplicate or conflicting notifications during rapid toggles.
- **Cross-Version GM Resolution**: Added fallback handling for `game.users.primaryGM` (V14) and `game.users.activeGM` (V13) when processing deleted chat messages.

### Fixed
- **Deleted Chat Message Author Compatibility**: Set both `author` (V14) and `user` (V13) on generated whisper messages to ensure cross-version permission and visibility compliance.

## 14.1.1

### Added
- **Chat Message Deletion Monitoring**: Added the **Track Deleted Chat Messages** setting (`trackDeletedMessages`) to whisper deleted player chat messages to the GM(s), processed by the active GM to keep whispers private.

### Improved
- **Foundry V14 Hook Compatibility**: Added support for `renderChatMessageHTML` alongside the legacy `renderChatMessage` hook for chat message styling.
- **Recipient Fallback**: Added a fallback ensuring messages are whispered to the GM if no actor owners can be resolved.

### Fixed
- **Item Name Escaping**: Added HTML escaping to item names in addition, removal, and update messages.
- **DnD5e Spell Slot Property Safety**: Added checks to ensure spell slot properties exist on the actor before checking for updates.

## 13.27

### Added
- **Initial Release**: Initial release of **Nik's Tiny Change Logs** (`niks-tiny-changelogs`).
- **Core Health Tracking**: Automatic monitoring of HP, Temporary HP, and Temp Max HP changes with compact, color-coded one-line chat messages.
- **System Auto-Detection**: Built-in data path detection for DnD5e, PF2e, and Shadow of the Demon Lord, with manual path configuration support for other game systems.
- **Currency Tracking**: Optional tracking of currency changes (Platinum, Gold, Electrum, Silver, Copper) for DnD5e and PF2e.
- **Item Inventory Tracking**: Optional tracking of item additions, deletions, quantity changes, and renaming.
- **Heroic Inspiration Tracking**: Optional tracking of DnD5e Inspiration gains and expenditures.
- **Smart Whisper Routing**: Automatic message routing whispering NPC changes to GMs and PC changes to GMs and actor owners.
- **Simple Output Mode**: Compact formatting option displaying simple deltas instead of full change transitions.