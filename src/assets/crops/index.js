import { createLettuce } from './lettuce.js';
import { createRadish } from './radish.js';
import { createTomato } from './tomato.js';
import { createPotato } from './potato.js';
import { createSweetPotato } from './sweetPotato.js';
import { createWheat } from './wheat.js';
import { createSoybean } from './soybean.js';

export const cropModels = Object.freeze({
  lettuce: createLettuce, radish: createRadish, tomato: createTomato,
  potato: createPotato, sweetPotato: createSweetPotato, wheat: createWheat, soybean: createSoybean
});
export function createCropModel(id) {
  const factory = cropModels[id];
  if (!factory) return null;
  const model = factory();
  model.name = id;
  return model;
}
export function disposeCropModel(model) {
  model.traverse(object => {
    object.geometry?.dispose();
    object.material?.dispose();
  });
}
