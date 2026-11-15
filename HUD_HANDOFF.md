# Mars HUD handoff

## Current state

- Branch: `UI-Overhaul`
- Scope: the new colony HUD, base/operations/goals panels, ration controls, grouped power controls, and their simulation selectors.
- Local preview: `http://127.0.0.1:5177/MarsFarming/` (when the existing dev server is running).
- Verification: `npm test` passes (69 tests); `npm run build` succeeds. Vite reports the existing large-bundle warning (about 1.87 MB minified JS).

## Run it

```sh
npm install
npm run dev -- --host 127.0.0.1
```

Open the URL Vite prints, including `/MarsFarming/` when using the current base path. Run `npm test` and `npm run build` before continuing.

## What changed

- `src/ui/colony/ResourceHud.js` builds the responsive DOM HUD, panels, controls, goals, dialogs, and toasts.
- `src/ui/colony/selectors.js` provides UI-facing resource, food runway, load, and goal progress data.
- `src/sim/powerLoads.js` defines configurable power groups and protects essential habitat loads.
- `src/sim/Simulation.js`, `src/sim/systems/power.js`, and `src/sim/systems/crew.js` connect the HUD controls to live simulation state. Rationing changes actual meal draw; disabling an optional load updates demand immediately.
- `src/sim/systems/nutrition.js` handles proportional pantry consumption when planting.
- `src/scenes/UIScene.js` and `src/scenes/ColonyScene.js` mount and refresh the HUD while keeping the existing Phaser game surface.
- `test/colony-selectors.test.js` covers food runway, grouped power controls, and goal progress/unlocks.

## Follow-up

- Check the HUD at 1280×720 and larger desktop sizes, plus narrow/mobile widths; tune the forecast strip and panel scrolling if needed.
- The selected-building and terrain-feature detail views still use the existing Phaser presentation. Convert those only if the design requires every detail panel to be DOM-based.
- Consider splitting the large production JS bundle if load time becomes a concern.
- Confirm the exact rationing multipliers in `public/data/balance.json` with the game design owner.

## Helpful navigation

- HUD and panel layout: `src/ui/colony/ResourceHud.js`
- UI data selectors: `src/ui/colony/selectors.js`
- Power groups: `src/sim/powerLoads.js`
- Simulation commands and planting costs: `src/sim/Simulation.js`
- Tests: `test/colony-selectors.test.js`
