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

The colony starts paused. Press **+1 sol** to step or run at **1×–8×**. Soil treatment takes one sol with power and water. In Medium and Hard, use the washer before planting. Select a plot to see its growth progress and the number of growing sols until harvest. Open **Timers** to track active events, equipment outages, and research downlinks.

## Landing map data

- Terrain is a custom rust-palette rendering derived from the [NASA Ames Marsoweb MOLA cylindrical shaded-relief product](https://marsoweb.nas.nasa.gov/globalData/datamaps.html). It is centered on 0° longitude. The relief colors are qualitative.
- The hydrogen overlay and landing readout use the [NASA Mars Odyssey HEND epithermal neutron grid](https://pds-geosciences.wustl.edu/missions/odyssey/grsspecial.html) in 4° × 4° cells. The game interpolates the normalized flux for display and multiplies it by 0.26 for counts per second. Lower neutron flux can indicate more near-surface hydrogen. The drill uses a game-scaled version of that signal.
- Solar potential shows modeled equinox noon sunlight relative to the equator. It uses the same clear-sky formula as the simulation. Dust and seasonal effects are handled on the surface.

The map assets ship with the game. To rebuild them on macOS, run `python3 scripts/prepare-mars-map.py MOLA_cylin.jpg hend_epithermal_020917.tab` with the two source files.

## Weather

Open **Weather** at the base for the next seven sols. The projection uses Kelton’s seasonal temperature model and ongoing events. Archived NASA observations are shown as historical context. The landing map’s **Weather difficulty** layer shows modeled cold and heating demand. Storm odds are set by the season and mission difficulty.

| Event | Gameplay effect |
|---|---|
| Regional dust storm | Solar output ×0.4 and comms capacity ×0.75 for 10–30 sols |
| Global dust storm | Solar output ×0.05 and comms capacity ×0.5 for 40–60 sols on Hard |
| Cold snap | Crop heating demand ×1.5 for 5 sols |

The weather API and datasets come from [Kelton’s weather integration](https://github.com/tofulot/MarsFarming/commit/1be471dffc18742c303763812de8a0cff23b5f8c). The model, event settings and source links are in `public/data/weather.json`. Archived observations are in `public/data/weather-observations.json`.

## Team handoff

| Owner | Work | Integration point |
|---|---|---|
| Tolui | Core gameplay | Phaser scenes in `src/scenes/` call `Simulation.command()` and read `Simulation.state`. |
| Kelton | Weather and events data | `public/data/weather.json` supplies the model and natural events. `sim.getWeather()` and `sim.forecastWeather()` expose current and predicted conditions. |
| Edwin | Plant genetics and mutations | `public/data/crops.json` supplies baseline traits, and `src/sim/systems/crops.js` owns growth and harvest. A planted crop is tied to its plot with `plotUid`; mutation and inheritance logic can extend that state. |

The [original playbook](Junior%20Astronaut%20Mars%20Farm%20README.md) describes the full project and source IDs. This implementation uses baseline crop traits and simulated weather. The NASA baseline crop data comes from the [Life Support Baseline Values and Assumptions Document](https://ntrs.nasa.gov/citations/20210024855). The seasonal calendar uses the [LMD solar longitude table](https://www-mars.lmd.jussieu.fr/mars/time/solar_longitude.new). Prices and resource tuning are game values.

OpenAI Codex assisted with the project scaffold, simulation, scenes, starter data encoded from the playbook, and tests.
