# Colony presentation

The colony UI builds on `red-harvest/mvp` at `3d42687`, retaining its rescue
progression, achievements, categorized shop, crop rules and weather simulation.
Resources sit at the top right; seeds, equipment, mission controls and a model
forecast sit along the bottom. The terrain is a stylized procedural illustration
of dusty Martian ground, not a satellite image. The rectangular simulation grid
and building coordinates are unchanged.

## Editing without changing the simulation

- `src/assets/crops/`: one independent Three.js factory per crop. Each returns a
  new group; register new factories in `index.js` using the crop's data ID.
  Geometry uses local plant coordinates, with the base at the origin and Y up.
- `src/rendering/CropLayer.js`: owns a single live Three.js renderer, composites
  its transparent output into Phaser, scales plants by growth, and disposes
  resources when the scene closes. Mature parts use `group.userData.mature`.
- `src/rendering/marsTerrain.js`: deterministic terrain illustration.
- `src/ui/colony/`: board drawing, resource HUD, equipment catalog, bottom dock,
  forecast and presentation lifecycle. Change these modules for visual work.
- `ColonyScene` retains the existing detail panels and simulation commands;
  `UIScene` connects the HUD to simulation events. Crop prices, unlocks, growth
  and resources come from the simulation rather than duplicate UI rules.

The seven models cover lettuce, radish, tomato, potato, sweet potato, wheat and
soybean. Forecasts are simulated projections from the shared weather interface,
not live Mars forecasts.

## Verification

Run `npm test` and `npm run build`. On hosts where Vite's bundled config loader
hangs, use `npm run build -- --configLoader native`.

The model test checks every current crop ID, independent instances and finite
geometry. Browser checks covered rescue startup, buying a plot and washer,
treating soil, planting, growing, harvesting/replanting, achievements and weather.
