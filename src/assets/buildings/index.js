// AI-assisted (Claude Code: registry of three.js building models for the board's model layer)
import { createCommsDish, setCommsDishState } from './commsDish.js';
import { createSupplyCrate, setSupplyCrateState } from './supplyCrate.js';
import { disposeModel } from './shared.js';

export { createCommsDish, setCommsDishState, createSupplyCrate, setSupplyCrateState };

/** key -> { create(), setState(group, state, timeMs) -> animating } */
export const buildingModels = Object.freeze({
  commsDish: Object.freeze({ create: createCommsDish, setState: setCommsDishState }),
  supplyCrate: Object.freeze({ create: createSupplyCrate, setState: setSupplyCrateState }),
});

export function createBuildingModel(key) {
  const entry = buildingModels[key];
  if (!entry) return null;
  const model = entry.create();
  model.name = key;
  return model;
}

/** Apply a state; returns true while a transient animation is playing. */
export function setBuildingModelState(key, model, state, time) {
  return Boolean(buildingModels[key]?.setState(model, state ?? {}, time));
}

/** Frees per-instance geometry and materials; shared parts stay cached for the next instance. */
export function disposeBuildingModel(model) {
  disposeModel(model);
}
