# Changelog

## 14.13.0

- Added **Settings Import / Export** functionality:
  - Export all module settings and custom tracked resource configurations into a clean, portable JSON file for easy backup or transfer across worlds.
  - Dedicated **Import / Export Settings** configuration menu in Foundry's Module Settings tab.
  - Supports importing settings with a preview confirmation dialog detailing found module settings and custom tracker configurations.
  - Flexible **Custom Trackers Handling** during import: choose to **Replace** all existing custom trackers or **Merge** them with existing definitions (avoiding duplicate paths).
  - Added dedicated **Export Trackers** and **Import Trackers** actions directly inside the **Custom Tracked Values** dialog for fast, localized management of custom tracker presets.

## 14.12.1

- **Message Visibility Fix**: Fixed an issue where player clients would still see changelog messages in their chat log for actions they performed even when **Message Visibility** was set to **GM only** (caused by Foundry's default behavior of showing outgoing whispers to their author). Unauthorized whisper recipients are now fully suppressed from chat rendering.

## 14.12.0

- Added **Ignored Names / Blacklist** world setting to filter out specific items, Active Effects, and custom resources from being reported in changelogs.
  - Supports comma-separated or newline-separated lists of names (case-insensitive, e.g. `Aura of Protection, Torch`).
  - Supports wildcards (`*` and `?`, e.g. `Aura of *` to ignore all paladin auras).
  - Supports regular expressions (e.g. `/^aura of/i`).
  - Evaluates changes across item additions, deletions, updates, equip/unequip, Active Effects, D&D 5e spell preparation, and custom tracked resources.

## 14.11.0

- Added **Message Visibility** world setting to control who sees changelog messages globally: **GM only** (whispered exclusively to GMs), **Player and GM** (public message, default), or **Player only** (whispered to all non-GM players; GMs will not see it in their chat). The existing *Whisper Target* and *NPC Message Audience* settings now act as refinements that only apply when Visibility is set to *Player and GM*.

## 14.10.0

- **Performance Optimizations**:
  - **Batch Message Creation**: Combined multi-attribute change notifications (e.g. HP, currency, spell slots) into single document batch operations (`ChatMessage.createDocuments`), reducing network and database overhead.
  - **Custom Tracked Resources Cache**: Cached parsed custom tracked resources in memory, eliminating redundant JSON parsing on every actor update.
  - **String Escaping & DOM Optimization**: Replaced DOM element creation in string escaping with native `foundry.utils.escapeHTML`.
  - **Actor Name Resolution**: Streamlined actor link generation to avoid unnecessary spatial canvas token queries.
  - **Active Effect Lookup**: Optimized active effect parent resolution to constant time ($O(1)$) using direct document properties instead of searching world actors.
  - **System Adapter Early Guards**: Added property existence guards in system adapters (such as D&D 5e spell slot tracking) to skip unnecessary path evaluations.
  - **CSS Containment & Render Hooks**: Added CSS layout containment (`contain: content`) to isolate chat message rendering and optimized render hook registration for Foundry V13/V14.

## 14.9.3

- **D&D 5e**: Fixed tracking for spell slots, death saves, and XP payload keys following adapter refactoring (thanks to [@zxlit](https://github.com/zxlit) in [#10](https://github.com/nschoenwald/niks-tiny-changelogs/pull/10)!).

## 14.9

- Added **Custom Tracked Values** feature. You can now configure any arbitrary actor data path to be tracked complete with customizable gain/loss messages, icons, and message colors. Configure this via the new dedicated submenu in the module settings. This is meant for advanced users.

## 14.8.2

- **Architecture Overhaul**: Completely refactored the module into a **System Adapter Pattern**. 
  - System-specific logic is no longer hardcoded into the main script.
  - Added dedicated adapters for **D&D 5e**, **Pathfinder 2e**, **Shadowdark**, **Shadow of the Demon Lord**, and **Mörk Borg**.
  - New systems can now be easily integrated without cluttering the core functionality.
  - Settings are dynamically registered so that only the configuration relevant to your active game system is displayed.
- Added support for the **Mörk Borg** game system (thanks to [@HectorCastelli](https://github.com/HectorCastelli)!), including:
  - **HP** tracking via `system.hp.value`.
  - **Attributes** tracking (increase/decrease), with a dedicated **Track Attributes** setting.
  - **Omens** tracking (gain/spend), with a dedicated **Track Omens** setting.
  - **Powers** tracking (use/recover), with a dedicated **Track Powers** setting.
  - **Silver** currency tracking via the existing **Track Currency** setting.

## 14.7

- Added **Compact Messages** world setting (enabled by default). Changelog messages are limited to a single line and smoothly expand on hover, keeping the chat log tidy.

## 14.6

- Added **Whisper Target** world setting to control who receives changelog messages: GM + Player (default), Player only, GM only, or Everyone.