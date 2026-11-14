<!-- AI-assisted (OpenAI Codex) -->
# Red Harvest

Choose a landing site on Mars, establish a greenhouse outpost, and keep four crew alive through dust season.

## Run the game

Install Node.js 22.12 or later.

```sh
npm install
npm run dev
npm test
npm run build
```

Open the URL Vite prints. Add `?demo=1` to the URL for a repeatable event sequence for a chosen site. In the colony, **1** starts a dust storm, **2** starts a solar particle event, **F** advances 30 sols, **]** switches to 4×, and **R** opens the report.

The colony starts paused. Buy and build a Soil Washer from the base shop and use it once before planting in Medium or Hard. Select an empty greenhouse to plant and select it again when the crop is ready to harvest. A powered dish automatically downlinks research.

## Landing map data

- Terrain is a custom rust-palette rendering derived from the [NASA Ames Marsoweb MOLA cylindrical shaded-relief product](https://marsoweb.nas.nasa.gov/globalData/datamaps.html). It is centered on 0° longitude. The relief colors are qualitative.
- The hydrogen overlay and landing readout use the [NASA Mars Odyssey HEND epithermal neutron grid](https://pds-geosciences.wustl.edu/missions/odyssey/grsspecial.html) in 4° × 4° cells. The game interpolates the normalized flux for display and multiplies it by 0.26 for counts per second. Lower neutron flux can indicate more near-surface hydrogen. The drill uses a game-scaled version of that signal.
- Solar potential shows modeled equinox noon sunlight relative to the equator. It uses the same clear-sky formula as the simulation. Dust and seasonal effects are handled on the surface.

The map assets ship with the game. To rebuild them on macOS, run `python3 scripts/prepare-mars-map.py MOLA_cylin.jpg hend_epithermal_020917.tab` with the two source files.

## Team handoff

| Owner | Work | Integration point |
|---|---|---|
| Tolui | Core gameplay | Phaser scenes in `src/scenes/` call `Simulation.command()` and read `Simulation.state`. |
| Kelton | Weather and events data | Put event definitions in `public/data/events.json`. See `public/data/demo-events.json` for the schema, with `id`, `name`, `durationSols`, `effects`, and optional probability and season scaling. `src/sim/systems/season.js` currently uses a simplified temperature model. |
| Edwin | Plant genetics and mutations | `public/data/crops.json` supplies baseline traits, and `src/sim/systems/crops.js` owns growth and harvest. A planted crop is tied to its plot with `plotUid`; mutation and inheritance logic can extend that state. |

The [original playbook](Junior%20Astronaut%20Mars%20Farm%20README.md) describes the full project and source IDs. This implementation uses baseline crop traits and simulated weather. The NASA baseline crop data comes from the [Life Support Baseline Values and Assumptions Document](https://ntrs.nasa.gov/citations/20210024855). The seasonal calendar uses the [LMD solar longitude table](https://www-mars.lmd.jussieu.fr/mars/time/solar_longitude.new). Prices and resource tuning are game values.

OpenAI Codex assisted with the project scaffold, simulation, scenes, starter data encoded from the playbook, and tests.
