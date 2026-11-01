import { adapter } from "../systems/index.mjs";

/** The document as an actor whose changes are tracked, or null (not an actor, or a type the system excludes). */
export function getTrackedActor(doc) {
  return (doc instanceof Actor && adapter.isTrackedActor(doc)) ? doc : null;
}
