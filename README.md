<!-- AI-assisted (OpenAI Codex) -->
# Red Harvest

You’re stranded alone on Mars. Farm enough food and keep your habitat running until rescue arrives.

## Run the game

Install Node.js 22.12 or later.

```sh
npm install
npm run dev
npm test
npm run build
```

Open the URL Vite prints. Add `?demo=1` to the URL for a repeatable event sequence for a chosen site. In the colony, **1** starts a dust storm, **2** starts a solar particle event, **F** advances 30 sols, **]** switches to 4×, and **R** opens the report.

Start Survival to spawn in Gale Crater, or choose a landing site on the map. You have 120 sols until rescue, 11 sols of rations, and 180 credits. Start with two Greenhouse Plots and a Soil Washer. Radishes mature in eight healthy sols. Random hazards begin after the starting ration window. Harvest milestones pay credit bonuses and unlock upgrades. Each purchase raises the next price of that item by 15%. The colony starts paused. Press **+1 sol** to step or run at **1×–4×**. One sol takes 15 seconds at 1×. Open **Achievements** for farming clues. Plant your first crop to earn **Botanist** and unlock colony naming. Soil treatment takes one sol with power and water. Open **Timers** to track active events, equipment outages, and research downlinks.

## Landing map data

- Terrain is a custom rust-palette rendering derived from the [NASA Ames Marsoweb MOLA cylindrical shaded-relief product](https://marsoweb.nas.nasa.gov/globalData/datamaps.html). It is centered on 0° longitude. The relief colors are qualitative.
- The hydrogen overlay and landing readout use the [NASA Mars Odyssey HEND epithermal neutron grid](https://pds-geosciences.wustl.edu/missions/odyssey/grsspecial.html) in 4° × 4° cells. The game interpolates the normalized flux for display and multiplies it by 0.26 for counts per second. Lower neutron flux can indicate more near-surface hydrogen. The drill uses a game-scaled version of that signal.
- Solar potential shows modeled equinox noon sunlight relative to the equator. It uses the same clear-sky formula as the simulation. Dust and seasonal effects are handled on the surface.

- Weather difficulty uses the [LMD Mars Climate Database dust climatology](https://www-mars.lmd.jussieu.fr/mars/dust_scenarios/index.html), based on [Montabone et al. (2015)](https://doi.org/10.1016/j.icarus.2014.12.034) and NASA orbiter observations. The bundled extract uses the four daily slices nearest Lₛ 45°, 135°, 225° and 315° (zero-based indices 93, 288, 445 and 586 in `dust_clim.nc`). Values are 9.3 μm absorption optical depth normalized to 610 Pa, rounded to 0.001 and interpolated between the original 5° grid points for display. The climatology averages Martian years 24–31 excluding two global storms. This data extract is distributed under [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/).

The terrain and hydrogen assets ship with the game. To rebuild them on macOS, run `python3 scripts/prepare-mars-map.py MOLA_cylin.jpg hend_epithermal_020917.tab` with the two source files.

## Weather

Open **Weather** at the base for the next seven sols. The projection uses Kelton’s seasonal temperature model and ongoing events. Archived NASA observations are shown as historical context. The landing map’s **Weather difficulty** layer shows regional airborne dust. Longer pink marks mean higher infrared dust optical depth, a measure of how strongly dust absorbs infrared light. Compare snapshots at four solar longitudes (Lₛ) to see how the pattern moves through the Martian year. Site details also show Kelton’s modeled cold-season low. The colony uses its own storm odds and event effects.

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
