import BaseSystemAdapter from "./base.mjs";
import Dnd5eAdapter from "./dnd5e.mjs";
import MorkBorgAdapter from "./morkborg.mjs";
import Pf2eAdapter from "./pf2e.mjs";
import ShadowdarkAdapter from "./shadowdark.mjs";
import DemonlordAdapter from "./demonlord.mjs";

const ADAPTERS = {
  dnd5e: Dnd5eAdapter,
  morkborg: MorkBorgAdapter,
  pf2e: Pf2eAdapter,
  shadowdark: ShadowdarkAdapter,
  demonlord: DemonlordAdapter
};

/**
 * The adapter of the active system, set by initAdapter during init.
 * @type {BaseSystemAdapter}
 */
export let adapter = null;

/**
 * Create the adapter for the given system, falling back to BaseSystemAdapter for systems without one.
 * @param {string} systemId
 * @returns {BaseSystemAdapter}
 */
export function initAdapter(systemId) {
  const Adapter = ADAPTERS[systemId] ?? BaseSystemAdapter;
  adapter = new Adapter();
  return adapter;
}
