// Localization helpers. All text lives in lang/en.json under "NTCL".

/**
 * Localize a key of this module, formatting `data` into it when given.
 * @param {string} key    Key below "NTCL." (e.g. "Line.HP")
 * @param {object} [data] Values for {placeholders}
 * @returns {string}
 */
export function t(key, data) {
  return data ? game.i18n.format(`NTCL.${key}`, data) : game.i18n.localize(`NTCL.${key}`);
}

/**
 * Localization keys for a setting's name and hint; Foundry localizes them when it displays the setting.
 * @param {string} key  The setting key
 * @returns {{name: string, hint: string}}
 */
export function settingText(key) {
  return { name: `NTCL.Settings.${key}.Name`, hint: `NTCL.Settings.${key}.Hint` };
}
