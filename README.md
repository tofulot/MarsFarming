<!-- AI-assisted (OpenAI Codex) -->
# Red Harvest

Design a Mars greenhouse mission, pack a cargo lander, grow food and keep four crew alive through dust season.

## Run the game

Install Node.js 22.12 or later.

```sh
npm install
npm run dev
npm test
npm run build
```

Open the URL Vite prints. Add `?demo=1` to the URL for a repeatable flight with starter cargo. In the colony, **1** starts a dust storm, **2** starts a solar particle event, **F** advances 30 sols, **]** switches to 4×, and **R** opens the report.

The colony starts paused. Pack or build a Soil Washer and use it once before planting in Medium or Hard. Select an empty greenhouse to plant and select it again when the crop is ready to harvest. A powered dish automatically downlinks research.

## Team handoff

| Owner | Work | Integration point |
|---|---|---|
| Tolui | Core gameplay | Phaser scenes in `src/scenes/` call `Simulation.command()` and read `Simulation.state`. |
| Kelton | Weather and events data | Put event definitions in `public/data/events.json`. See `public/data/demo-events.json` for the schema, with `id`, `name`, `durationSols`, `effects`, and optional probability and season scaling. `src/sim/systems/season.js` currently uses a simplified temperature model. |
| Edwin | Plant genetics and mutations | `public/data/crops.json` supplies baseline traits, and `src/sim/systems/crops.js` owns growth and harvest. A planted crop is tied to its plot with `plotUid`; mutation and inheritance logic can extend that state. |

The [original playbook](Junior%20Astronaut%20Mars%20Farm%20README.md) describes the full project and source IDs. This implementation uses a schematic coordinate map, baseline crop traits, and simulated weather. The NASA baseline crop data comes from the [Life Support Baseline Values and Assumptions Document](https://ntrs.nasa.gov/citations/20210024855). The seasonal calendar uses the [LMD solar longitude table](https://www-mars.lmd.jussieu.fr/mars/time/solar_longitude.new). In-game payload costs, ratings, and resource tuning are game values.

OpenAI Codex assisted with the project scaffold, simulation, scenes, starter data encoded from the playbook, and tests.
