import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Box3, Vector3 } from 'three';
import { createCropModel, disposeCropModel, cropModels } from '../src/assets/crops/index.js';

const crops = JSON.parse(readFileSync(new URL('../public/data/crops.json', import.meta.url)));
test('every game crop has an independent, finite Three.js model', () => {
  for (const crop of crops) {
    assert.ok(cropModels[crop.id], crop.id);
    const first = createCropModel(crop.id);
    const second = createCropModel(crop.id);
    assert.notEqual(first, second);
    assert.notEqual(first.children[0], second.children[0]);
    const bounds = new Box3().setFromObject(first).getSize(new Vector3());
    assert.ok(bounds.x > 0 && bounds.y > 0 && bounds.z > 0);
    first.traverse(object => {
      const positions = object.geometry?.attributes.position.array;
      if (positions) assert.ok(positions.every(Number.isFinite));
    });
    disposeCropModel(first);
    disposeCropModel(second);
  }
  assert.equal(createCropModel('unknown-crop'), null);
});
