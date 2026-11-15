// AI-assisted (Claude Code: three.js building model checks)
import test from 'node:test';
import assert from 'node:assert/strict';
import { Box3, Vector3 } from 'three';
import { buildingModels, createBuildingModel, disposeBuildingModel, setBuildingModelState } from '../src/assets/buildings/index.js';
import { countTriangles } from '../src/assets/buildings/shared.js';

const finite = (model) => model.traverse((object) => {
  const positions = object.geometry?.attributes.position.array;
  if (positions) assert.ok(positions.every(Number.isFinite), object.name);
});

test('every building model is independent, finite and under the triangle budget', () => {
  for (const key of Object.keys(buildingModels)) {
    const first = createBuildingModel(key);
    const second = createBuildingModel(key);
    assert.notEqual(first, second);
    const bounds = new Box3().setFromObject(first).getSize(new Vector3());
    assert.ok(bounds.x > 0.3 && bounds.y > 0.2 && bounds.z > 0.2, `${key} ${bounds.toArray()}`);
    finite(first);
    assert.ok(countTriangles(first) < 1500, `${key}: ${countTriangles(first)} triangles`);
    disposeBuildingModel(first);
    // Shared geometry survives disposing another instance.
    second.traverse((object) => {
      if (object.geometry?.userData.shared) assert.ok(object.geometry.attributes.position.count > 0);
    });
    disposeBuildingModel(second);
  }
  assert.equal(createBuildingModel('unknown'), null);
});

test('comms dish swaps broken and repaired, and pops only on a live repair', () => {
  const dish = createBuildingModel('commsDish');
  const { broken, repaired } = dish.userData;
  assert.equal(setBuildingModelState('commsDish', dish, { repaired: false, online: false }, 0), false);
  assert.ok(broken.visible && !repaired.visible);
  assert.equal(setBuildingModelState('commsDish', dish, { repaired: true, online: true }, 1000), true);
  assert.ok(!broken.visible && repaired.visible);
  assert.equal(setBuildingModelState('commsDish', dish, { repaired: true, online: true }, 5000), false);
  const fresh = createBuildingModel('commsDish');
  assert.equal(setBuildingModelState('commsDish', fresh, { repaired: true, online: true }, 0), false);

  const { lamp, rings, yaw } = repaired.userData;
  setBuildingModelState('commsDish', dish, { repaired: true, online: true, ordering: true }, 6000);
  assert.ok(rings.every((ring) => ring.visible));
  const amber = lamp.halo.material.color.getHex();
  setBuildingModelState('commsDish', dish, { repaired: true, online: false, ordering: true }, 6000);
  assert.ok(rings.every((ring) => !ring.visible));
  assert.notEqual(lamp.halo.material.color.getHex(), amber);
  const still = yaw.rotation.y;
  setBuildingModelState('commsDish', dish, { repaired: true, online: false }, 9000);
  assert.equal(yaw.rotation.y, still);
});

test('supply crate drops in once and then rests on the ground', () => {
  const crate = createBuildingModel('supplyCrate');
  const { box, open } = crate.userData;
  assert.equal(setBuildingModelState('supplyCrate', crate, {}, 0), false);
  assert.equal(box.position.y, 0);
  assert.equal(setBuildingModelState('supplyCrate', crate, { drop: true }, 100), true);
  setBuildingModelState('supplyCrate', crate, { drop: true }, 300);
  assert.ok(box.position.y > 0.5 && open.visible);
  assert.equal(setBuildingModelState('supplyCrate', crate, { drop: true }, 5000), false);
  assert.equal(box.position.y, 0);
  assert.ok(!open.visible);
});
