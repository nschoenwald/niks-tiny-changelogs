import { exportCustomTrackers, readJsonFile } from "./settings-import-export.mjs";
import { CUSTOM_RESOURCE_DEFAULTS, extractCustomResources, mergeCustomResources, parseCustomResources, readStoredCustomResources, saveCustomResources } from "./custom-resources.mjs";
import { MOD_ID, TRACKER_CONFIG_ID } from "./constants.mjs";
import { t } from "./i18n.mjs";

const { ApplicationV2, HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;

async function promptImportMode(trackerCount, filename) {
  return DialogV2.wait({
    window: { title: "NTCL.Trackers.ImportTitle" },
    content: t("Trackers.ImportPrompt", { count: trackerCount, file: foundry.utils.escapeHTML(filename) }),
    buttons: [
      { action: "append", label: "NTCL.Trackers.ImportAppend", icon: "fas fa-plus", default: true, callback: () => "append" },
      { action: "replace", label: "NTCL.Trackers.ImportReplace", icon: "fas fa-sync", callback: () => "replace" },
      { action: "cancel", label: "NTCL.Trackers.Cancel", icon: "fas fa-times", callback: () => null }
    ],
    rejectClose: false,
    modal: true
  });
}

export default class CustomTrackerConfig extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor(options) {
    super(options);
    this.reloadFromSettings();
  }

  static DEFAULT_OPTIONS = {
    id: TRACKER_CONFIG_ID,
    tag: "form",
    classes: ["niks-tiny-changelogs-config"],
    window: { title: "NTCL.Trackers.Title", icon: "fas fa-cogs" },
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
    this.localResources = readStoredCustomResources();
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
    await saveCustomResources(data.resources ? Object.values(data.resources) : []);
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
      const incomingTrackers = extractCustomResources(await readJsonFile(file)) ?? [];
      if (incomingTrackers.length === 0) {
        ui.notifications.warn(t("Trackers.NoneFound"));
        return;
      }

      const mode = await promptImportMode(incomingTrackers.length, file.name);
      if (!mode) return;

      this.#syncFromForm();

      this.localResources = mode === "replace"
        ? incomingTrackers
        : mergeCustomResources(this.localResources, incomingTrackers);

      this.render();
      ui.notifications.info(t("Trackers.Imported", { count: incomingTrackers.length }));
    } catch (err) {
      console.error(`[${MOD_ID}] Failed to import custom trackers:`, err);
      ui.notifications.error(t("Trackers.ImportFailed", { error: err.message }));
    }
  }
}
