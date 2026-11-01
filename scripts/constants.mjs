// Shared constants.

export const MOD_ID = "niks-tiny-changelogs";
export const TRACKER_CONFIG_ID = `${MOD_ID}-custom-tracker-config`;

/** Longer actor names are clipped in changelog lines. */
export const MAX_NAME_CHARS = 25;

/** Changes to one document within this window are reported as one change. */
export const DEBOUNCE_MS = 350;

/** Messages queued within this window are created in one batch. */
export const MESSAGE_FLUSH_MS = 100;
