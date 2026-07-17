# Changelog

## 14.8

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