# Nik's Tiny Change Logs

![Foundry v13/v14](https://img.shields.io/badge/Foundry-v13%2Fv14-orange)

**Nik's Tiny Change Logs** is a lightweight Foundry VTT module that monitors changes to your actors and tokens, posting clean, concise, one-line chat messages to keep everyone informed without cluttering the chat log. 

It keeps track of health changes, currency adjustments, item inventory updates, monitors deleted chat messages, and includes specialized tracking for DnD5e mechanics like inspiration, death saves, and spell usage, as well as Mörk Borg mechanics like Omens, Powers, and Silver.

## Features

### 🫀 Core Health Tracking
Automatically monitors and logs changes to:
- **HP (Health Points)**: Shows damage taken and healing received.
- **Temporary HP**: Tracks gains and losses of temp health.
- **Temp Max HP**: Logs adjustments to temporary maximum health.

The module features **Auto-Detection** for health data paths, working out of the box with major systems like `dnd5e`, `pf2e`, `shadowdark`, `demonlord`, and `morkborg`. It also uses a heuristic probe for unsupported systems, but allows you to manually specify the data paths in the settings if automatic detection fails.

### 💰 Currency Tracking
Logs whenever an actor gains or loses currency (e.g., Gold, Silver, Copper). It automatically detects the correct currency paths for `dnd5e` and `pf2e`, but can be manually configured for other systems.

### 🎒 Item & Inventory Tracking
Keep an eye on what your players pick up or consume!
- **Quantity Adjustments**: Logs when items are consumed, bought, or given away.
- **Limited Uses**: Logs when an item with limited uses spends or regains uses.
- **Additions & Deletions**: Logs when an item is added to an actor or removed entirely.
- **Renaming**: Logs when an item's name is changed.

### 🗑️ Chat Moderation
When a player deletes a chat message, the module can automatically clone the original message and whisper it to the GM(s). This is perfect for keeping an eye on accidentally (or purposely) deleted rolls!

### 👕 Equip / Unequip Tracking *(disabled by default)*
Optionally logs when an item is equipped or unequipped on an actor. Enable this via the **Track Equip / Unequip** setting.

### ✨ Active Effect Tracking *(disabled by default)*
Optionally logs when Active Effects are added, removed, enabled, or disabled on an actor. Enable this via the **Track Active Effects** setting.

### 🐉 DnD5e Specific Features
The module includes deep integration with the generic DnD5e system (5.2+):
- **Heroic Inspiration**: Logs when a player gains or spends Inspiration.
- **Death Saves**: Separately tracks successes and failures during tense death saving throws.
- **Spell Preparation**: Logs when a spell is prepared or unprepared from a character's spell list.
- **Spell Slots**: Tracks the expenditure and regaining of spell slots across all levels.
- **Hit Dice**: Logs when Hit Dice are expended or regained.
- **Experience Points**: Logs when a character gains or loses XP.

### 💀 Mörk Borg Specific Features
The module includes integration with the Mörk Borg system:
- **Attributes**: Logs when a characters increases or decreases an Attribute score.
- **Omens**: Logs when a character gains or spends Omens.
- **Powers**: Logs when a character uses or recovers Powers.
- **Silver**: Tracked automatically via the Currency Tracking setting.

## Configuration & Settings

You can customize the module's behavior in the settings to perfectly match your table's needs:

- **Simplified Output**: Toggle between full transition logs (e.g., `10 + 5 → 15`) or simplified math logs (`+5`).
- **NPC Message Audience**: Control who sees changes to NPC stats. Options include:
  - *GM Only* (Private)
  - *GM + Owners* (Default)
  - *GM + All Players* (Public)
- **Feature Toggles**: You can individually enable or disable Currency Tracking, Item Changes, Deleted Message Tracking, Equip/Unequip Tracking, Active Effect Tracking, and all DnD5e-specific trackers.

### Advanced Data Paths
If the module fails to detect your system's data structure automatically, disable **Auto-Detect HP Paths** and provide the exact system data paths for:
- HP Value Path (ex: `system.attributes.hp.value`)
- Temp HP Path (ex: `system.attributes.hp.temp`)
- Temp HP Max Path (ex: `system.attributes.hp.tempmax`)
- Currency Base Path (ex: `system.currency`)

## Compatibility
- **Foundry VTT**: Verified for V13 and V14.
- **Systems**: Fully supports `dnd5e`, `pf2e`, `shadowdark`, `demonlord`, and `morkborg` out of the box. Other systems are supported dynamically or via manual configuration.
