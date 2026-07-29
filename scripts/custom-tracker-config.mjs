import { clearCustomResourcesCache } from "./niks-tiny-changelogs.mjs";

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
