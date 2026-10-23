import { exportCustomTrackers, readJsonFile } from "./settings-import-export.mjs";
import { CUSTOM_RESOURCE_DEFAULTS, parseCustomResources } from "./custom-resources.mjs";

const MOD_ID = "niks-tiny-changelogs";
const { ApplicationV2, HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;

async function promptImportMode(trackerCount, filename) {
  return DialogV2.wait({
    window: { title: "Import Custom Trackers" },
    content: `<p>Found <strong>${trackerCount}</strong> custom tracker(s) in <em>${foundry.utils.escapeHTML(filename)}</em>.</p><p>How would you like to apply them to your current list?</p>`,
    buttons: [
      { action: "append", label: "Append / Merge", icon: "fas fa-plus", default: true, callback: () => "append" },
      { action: "replace", label: "Replace All", icon: "fas fa-sync", callback: () => "replace" },
      { action: "cancel", label: "Cancel", icon: "fas fa-times", callback: () => null }
    ],
    rejectClose: false,
    modal: true
  });
}

/** Extract tracker definitions from any supported export format. */
function extractTrackers(data) {
  if (Array.isArray(data?.customTrackers)) return data.customTrackers;
  if (data?.settings?.customTrackedResources) return data.settings.customTrackedResources;
  if (Array.isArray(data)) return data;
  return [];
}

export default class CustomTrackerConfig extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor(options) {
    super(options);
    this.reloadFromSettings();
  }

  static DEFAULT_OPTIONS = {
    id: "niks-tiny-changelogs-custom-tracker-config",
    tag: "form",
    classes: ["niks-tiny-changelogs-config"],
    window: { title: "Custom Tracked Values", icon: "fas fa-cogs" },
    position: { width: 900, height: "auto" },
    form: { handler: CustomTrackerConfig.#onSubmit, closeOnSubmit: true },
    actions: {
      addResource: CustomTrackerConfig.#onAddResource,
      deleteResource: CustomTrackerConfig.#onDeleteResource,
      browseIcon: CustomTrackerConfig.#onBrowseIcon,
      exportTrackers: CustomTrackerConfig.#onExportTrackers,
      importTrackers: CustomTrackerConfig.#onImportTrackers
    }
  };

  static PARTS = {
    form: { template: `modules/${MOD_ID}/templates/custom-tracker.hbs` }
  };

  /** Replace the unsaved local list with the stored setting (e.g. after a settings import). */
  reloadFromSettings() {
    this.localResources = parseCustomResources(game.settings.get(MOD_ID, "customTrackedResources"));
  }

  async _prepareContext(options) {
    return { resources: this.localResources };
  }

  _onRender(context, options) {
    super._onRender(context, options);
    const fileInput = this.element.querySelector("input.tracker-import-file-input");
    fileInput?.addEventListener("change", ev => this.#onImportFileSelected(ev));
  }

  /** Read the current (unsaved) rows from the form. */
  #readForm() {
    const data = foundry.utils.expandObject(new foundry.applications.ux.FormDataExtended(this.element).object);
    return data.resources ? Object.values(data.resources) : [];
  }

  #syncFromForm() {
    this.localResources = this.#readForm();
  }

  static async #onSubmit(event, form, formData) {
    const data = foundry.utils.expandObject(formData.object);
    const resources = parseCustomResources(data.resources ? Object.values(data.resources) : []);
    await game.settings.set(MOD_ID, "customTrackedResources", JSON.stringify(resources));
  }

  static #onAddResource(event) {
    event.preventDefault();
    this.#syncFromForm();
    this.localResources.push({ ...CUSTOM_RESOURCE_DEFAULTS });
    this.render();
  }

  static #onDeleteResource(event, target) {
    event.preventDefault();
    this.#syncFromForm();
    const index = Number(target.closest(".tracker-row")?.dataset.index);
    if (Number.isInteger(index)) this.localResources.splice(index, 1);
    this.render();
  }

  static #onBrowseIcon(event, target) {
    event.preventDefault();
    const input = this.element.querySelector(`input[name="${target.dataset.target}"]`);
    if (!input) return;
    const currentVal = input.value ?? "";
    const isPath = currentVal.includes("/") || currentVal.includes(".");
    const FilePicker = foundry.applications.apps.FilePicker.implementation;
    new FilePicker({
      type: "image",
      current: isPath ? currentVal : "",
      callback: path => { input.value = path; }
    }).browse();
  }

  static #onExportTrackers(event) {
    event.preventDefault();
    this.#syncFromForm();
    exportCustomTrackers(parseCustomResources(this.localResources));
  }

  static #onImportTrackers(event) {
    event.preventDefault();
    const fileInput = this.element.querySelector("input.tracker-import-file-input");
    if (!fileInput) return;
    fileInput.value = "";
    fileInput.click();
  }

  async #onImportFileSelected(ev) {
    const file = ev.target.files?.[0];
    if (!file) return;

    try {
      const incomingTrackers = parseCustomResources(extractTrackers(await readJsonFile(file)));
      if (incomingTrackers.length === 0) {
        ui.notifications.warn("No custom tracker configurations found in the selected file.");
        return;
      }

      const mode = await promptImportMode(incomingTrackers.length, file.name);
      if (!mode) return;

      this.#syncFromForm();

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
      console.error(`[${MOD_ID}] Failed to import custom trackers:`, err);
      ui.notifications.error(`Failed to import custom trackers: ${err.message}`);
    }
  }
}
