# Nik's Tiny Change Logs

![Foundry v13/v14](https://img.shields.io/badge/Foundry-v13%2Fv14-orange)

**Nik's Tiny Change Logs** is a lightweight Foundry VTT module that monitors changes to your actors and tokens, posting clean, concise, one-line chat messages to keep everyone informed without cluttering the chat log. 

It keeps track of health changes, currency adjustments, item inventory updates, monitors deleted chat messages, and includes specialized tracking for DnD5e mechanics like inspiration, death saves, and spell usage, as well as Mörk Borg mechanics like Omens, Powers, and Silver.

---

## Compatibility

- **Foundry VTT**: V13 – V14
- **System**: System-agnostic (Dedicated tracking for DnD5e, PF2e, Shadowdark, Mörk Borg, Demonlord)

---

## Other Modules by Nik

### 🎲 D&D 5e Specific
* **[Nik's DnD5e Tweaks](https://github.com/nschoenwald/niks-dnd5e-tweaks)** – Consolidated collection of quality-of-life enhancements and combat automation tweaks for DnD5e.

### ⚔️ Combat & Token Tools
* **[Nik's Token Tags](https://github.com/nschoenwald/niks-token-tags)** – Automatically numbers duplicate combatant NPCs (A, B, C…) with color-coded letter overlays.
* **[Nik's Shared NPC Initiative](https://github.com/nschoenwald/niks-shared-npc-initiative)** – Groups NPCs of the same type in combat so they share a single initiative roll.
* **[Nik's Movement Control](https://github.com/nschoenwald/niks-movement-control)** – GM controls to toggle player movement and automatically restrict/allow movement on combat start and end.

### ⚙️ Utilities & System Management
* **[Nik's Settings Locks](https://github.com/nschoenwald/niks-settings-locks)** – Soft-lock and hard-lock client settings and keybindings across all connected players.
* **[Nik's Compendium Search Tweaks](https://github.com/nschoenwald/niks-compendium-search-tweaks)** – Configure which compendium packs are included or excluded from native sidebar search.
* **[Nik's Show & Tell](https://github.com/nschoenwald/niks-show-and-tell)** – Share popout images to chat and paste image files directly into chat messages.
* **[Nik's Zoom / Pan Options](https://github.com/nschoenwald/niks-zoom-pan-options)** – Touchpad and scroll wheel pan/zoom controls and canvas navigation enhancements.

---

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

### 🛠️ Custom Tracked Values
Have a homebrew mechanic or playing a system that isn't fully supported out of the box? You can now define **Custom Tracked Values** via a dedicated submenu in the module settings.

#### How to Configure Custom Tracked Values
1. Go to the module settings and click the **Configure** button under the "Custom Tracked Values" setting to open the configuration window.
2. Click the **+** icon to add a new tracked resource.
3. Configure the following fields:
   - **Name**: The display name of the resource (e.g., `Wounds` or `Fatigue`).
   - **Path**: The exact data path on the actor (e.g., `system.attributes.fatigue.value`).
   - **Gain Msg**: The message to show when the value increases (e.g., `gained {name}`).
   - **Loss Msg**: The message to show when the value decreases (e.g., `healed {name}`).
   - **Icon**: A FontAwesome class name (e.g., `fa-solid fa-droplet`) OR use the file picker button to select an image/svg from your Foundry server!
   - **Color**: Select a custom background color for the chat message using the color picker.
4. Click **Save Changes**.

**Formatting Placeholders:**
Your gain and loss messages can use the following placeholders to make them dynamic:
- `{name}` - The name you gave the resource.
- `{old}` - The value before the update.
- `{new}` - The new value after the update.
- `{diff}` - The absolute difference between the old and new values.

*Note: The module evaluates changes numerically. If you track a boolean property (true/false), it will be treated as `1` (true) or `0` (false). A change from false to true triggers a gain of +1.*

### 🐉 DnD5e Specific Features
The module includes integration with the DnD5e system (5.2+):
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
