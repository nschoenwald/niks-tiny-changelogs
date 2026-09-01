import { clearCustomResourcesCache } from "./niks-tiny-changelogs.mjs";
import { exportCustomTrackers, readJsonFile } from "./settings-import-export.mjs";

function escapeHTML(str) {
  return foundry.utils?.escapeHTML ? foundry.utils.escapeHTML(String(str ?? "")) : String(str ?? "");
}

async function promptImportMode(trackerCount, filename) {
  if (foundry.applications?.api?.DialogV2?.wait) {
    return await foundry.applications.api.DialogV2.wait({
      window: { title: "Import Custom Trackers" },
      content: `<p>Found <strong>${trackerCount}</strong> custom tracker(s) in <em>${escapeHTML(filename)}</em>.</p><p>How would you like to apply them to your current list?</p>`,
      buttons: [
        {
          action: "append",
          label: '<i class="fas fa-plus"></i> Append / Merge',
          default: true,
          callback: () => "append"
        },
        {
          action: "replace",
          label: '<i class="fas fa-sync"></i> Replace All',
          callback: () => "replace"
        },
        {
          action: "cancel",
          label: '<i class="fas fa-times"></i> Cancel',
          callback: () => null
        }
      ],
      modal: true
    });
  }

  return new Promise(resolve => {
    new Dialog({
      title: "Import Custom Trackers",
      content: `<p>Found <strong>${trackerCount}</strong> custom tracker(s) in <em>${escapeHTML(filename)}</em>.</p><p>How would you like to apply them to your current list?</p>`,
      buttons: {
        append: {
          icon: '<i class="fas fa-plus"></i>',
          label: "Append / Merge",
          callback: () => resolve("append")
        },
        replace: {
          icon: '<i class="fas fa-sync"></i>',
          label: "Replace All",
          callback: () => resolve("replace")
        },
        cancel: {
          icon: '<i class="fas fa-times"></i>',
          label: "Cancel",
          callback: () => resolve(null)
        }
      },
      default: "append",
      close: () => resolve(null)
    }).render(true);
  });
}

export default class CustomTrackerConfig extends FormApplication {
  constructor(...args) {
    super(...args);
    try {
      const setting = game.settings.get("niks-tiny-changelogs", "customTrackedResources");
      this.localResources = setting ? JSON.parse(setting) : [];
    } catch {
      this.localResources = [];
    }
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "niks-tiny-changelogs-custom-tracker-config",
      title: "Custom Tracked Values",
      template: "modules/niks-tiny-changelogs/templates/custom-tracker.hbs",
      width: 900,
      height: "auto",
      closeOnSubmit: true,
      classes: ["niks-tiny-changelogs-config"]
    });
  }

  getData(options) {
    return { resources: this.localResources };
  }

  activateListeners(html) {
    super.activateListeners(html);
    html.find('.tracker-action[data-action="add"]').click(this._onAddResource.bind(this));
    html.find('.tracker-action[data-action="delete"]').click(this._onDeleteResource.bind(this));
    
    html.find('button.custom-file-picker').click((ev) => {
      ev.preventDefault();
      const targetName = ev.currentTarget.dataset.target;
      const input = html.find(`input[name="${targetName}"]`);
      
      const currentVal = input.val();
      const isPath = currentVal.includes('/') || currentVal.includes('.');
      
      new FilePicker({
        type: "image",
        current: isPath ? currentVal : "",
        callback: (path) => {
          input.val(path);
        }
      }).browse();
    });

    // Tracker Export button
    html.find('button.tracker-export-btn').click((ev) => {
      ev.preventDefault();
      this._updateLocalResourcesFromForm();
      exportCustomTrackers(this.localResources);
    });

    // Tracker Import button & hidden input
    const fileInput = html.find('input.tracker-import-file-input');
    html.find('button.tracker-import-btn').click((ev) => {
      ev.preventDefault();
      fileInput.val("");
      fileInput.click();
    });

    fileInput.change(async (ev) => {
      const file = ev.target.files?.[0];
      if (!file) return;

      try {
        const data = await readJsonFile(file);
        let incomingTrackers = [];

        if (Array.isArray(data.customTrackers)) {
          incomingTrackers = data.customTrackers;
        } else if (data.settings?.customTrackedResources) {
          try {
            incomingTrackers = typeof data.settings.customTrackedResources === "string"
              ? JSON.parse(data.settings.customTrackedResources)
              : data.settings.customTrackedResources;
          } catch {
            incomingTrackers = [];
          }
        } else if (Array.isArray(data)) {
          incomingTrackers = data;
        }

        if (!Array.isArray(incomingTrackers) || incomingTrackers.length === 0) {
          ui.notifications.warn("No custom tracker configurations found in the selected file.");
          return;
        }

        const mode = await promptImportMode(incomingTrackers.length, file.name);
        if (!mode) return;

        this._updateLocalResourcesFromForm();

        if (mode === "replace") {
          this.localResources = incomingTrackers;
        } else if (mode === "append") {
          const existingPaths = new Set(this.localResources.map(r => r.path));
          for (const item of incomingTrackers) {
            if (!existingPaths.has(item.path)) {
              this.localResources.push(item);
              existingPaths.add(item.path);
            }
          }
        }

        this.render();
        ui.notifications.info(`Imported ${incomingTrackers.length} custom tracker(s). Click "Save Changes" to save.`);
      } catch (err) {
        console.error("[niks-tiny-changelogs] Failed to import custom trackers:", err);
        ui.notifications.error(`Failed to import custom trackers: ${err.message}`);
      }
    });
  }

  _updateLocalResourcesFromForm() {
    const formData = this._getSubmitData();
    const expanded = foundry.utils.expandObject(formData);
    this.localResources = expanded.resources ? Object.values(expanded.resources) : [];
  }

  async _onAddResource(event) {
    event.preventDefault();
    this._updateLocalResourcesFromForm();
    this.localResources.push({
      name: "",
      path: "",
      msgGain: "gained {name}",
      msgLoss: "lost {name}",
      icon: "fa-solid fa-star",
      color: "#666666"
    });
    this.render();
  }

  async _onDeleteResource(event) {
    event.preventDefault();
    this._updateLocalResourcesFromForm();
    const index = Number(event.currentTarget.closest('.tracker-row').dataset.index);
    this.localResources.splice(index, 1);
    this.render();
  }

  async _updateObject(event, formData) {
    const expanded = foundry.utils.expandObject(formData);
    const resources = expanded.resources ? Object.values(expanded.resources) : [];
    await game.settings.set("niks-tiny-changelogs", "customTrackedResources", JSON.stringify(resources));
    clearCustomResourcesCache();
  }
}
