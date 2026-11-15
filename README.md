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

Open the URL Vite prints. Use **↑/↓** (or W/S) and **Enter** on the title menu, or click. Add `?demo=1` to the URL for a repeatable event sequence for a chosen site. In the colony, **1** starts a dust storm, **2** starts a solar particle event, **F** advances 30 sols, **]** switches to 4×, and **R** opens the report. Demo keys are ignored while you type in a dialog.

After you land, a 7-second intro shows your rocket burning in and crashing; click, or press Escape, Space or Enter, to skip it. Add `?intro=0` to the URL to turn it off while testing. The clip is pre-rendered from the Remotion project in `cutscene/` (see its README): code-drawn pixel art and a procedurally synthesised fire sound, written with AI assistance, with no generated images or audio samples.

Choose **Start survival** to land in Gale Crater, or **Choose landing site** to compare terrain, ice, solar potential, and weather on the map. You have 120 sols until rescue, 11 sols of rations, and 180 kg of build materials. The colony starts paused.

**Build materials (kg)** are the one currency. You earn them by mining rock deposits (select a rock, then **Mine deposit**), scrapping the crashed rocket once its fire is out, harvesting crops (inedible biomass recovered as feedstock, a game value), and earning achievements. Every shop price is in kg.

**Camera:** the mouse wheel zooms toward the cursor; the **−/+** control at the bottom-right of the map or the +/- keys also zoom. Zooming out reveals more of the landing site. Drag the board, or use WASD or the arrow keys, to pan.

1. Open **Base** under the vital statistics. Buy two Greenhouse Plots and a Soil Washer. Press **+1 sol** to treat the plots. The washer starts automatically when it has power and water.
2. Select each treated plot and plant radishes from the seed dock. Each planting uses 0.2 kg of food. Radishes mature in eight healthy sols. Harvest and replant to keep food available. You start with radish and lettuce seed.
3. **New crops come from the Comms Dish.** It was wrecked in the landing. Select it and repair it for 120 kg of build materials (it then draws 400 W). A repaired, powered dish can radio one seed order at a time, up to 0.5 kg of seed packets (packet masses are game values). The drop lands as a supply crate near the base 20 sols later; the dish panel and **Ops** show the countdown. Click the crate and choose **Collect crate** to add the seeds to your vault for good. A repaired dish also downlinks research.
4. Watch the resource readings and forecast. Use **+1 sol** for precise steps or **1×–4×** for continuous play. One sol takes 15 seconds at 1×. Open **Ops** for rationing, power loads, and event timers and **Goals** for progression clues. The top strip shows each resource with its trend (for example "−3 / sol" or "runs out sol 11"); a chip turns amber when it needs attention. Messages appear just above the weather bar and fade on their own once the bar along their bottom fills; hover to keep one open. Reaching **Halfway Home** (sol 60) unlocks colony naming; after that, click the colony name in the top bar to rename it.
5. Reach the rescue sol to open the report. You can read the crop journal, return to the main menu, or try another landing site. **Abandon** ends the current run after confirmation. In demo mode, **R** also ends the run and opens the report.

## Landing map data

- Terrain is a custom rust-palette rendering derived from the [NASA Ames Marsoweb MOLA cylindrical shaded-relief product](https://marsoweb.nas.nasa.gov/globalData/datamaps.html). It is centered on 0° longitude. The relief colors are qualitative. The colony ground samples the atlas around the selected landing site, adds seeded procedural detail (regolith grain, pebbles, craters, wind ripples), and scales rock density with the local MOLA relief (game-scaled). Icy patches and the drill use the HEND signal below. Rock deposits and the crashed rocket are placed differently for each site and seed.
- The hydrogen overlay and landing readout use the [NASA Mars Odyssey HEND epithermal neutron grid](https://pds-geosciences.wustl.edu/missions/odyssey/grsspecial.html) in 4° × 4° cells. The game interpolates the normalized flux for display and multiplies it by 0.26 for counts per second. Lower neutron flux can indicate more near-surface hydrogen. The drill uses a game-scaled version of that signal.
- Solar potential shows modeled equinox noon sunlight relative to the equator. It uses the same clear-sky formula as the simulation. Dust and seasonal effects are handled on the surface.

- Weather difficulty uses the [LMD Mars Climate Database dust climatology](https://www-mars.lmd.jussieu.fr/mars/dust_scenarios/index.html), based on [Montabone et al. (2015)](https://doi.org/10.1016/j.icarus.2014.12.034) and NASA orbiter observations. The bundled extract uses the four daily slices nearest Lₛ 45°, 135°, 225° and 315° (zero-based indices 93, 288, 445 and 586 in `dust_clim.nc`). Values are 9.3 μm absorption optical depth normalized to 610 Pa, rounded to 0.001 and interpolated between the original 5° grid points for display. The climatology averages Martian years 24–31 excluding two global storms. This data extract is distributed under [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/).

The terrain and hydrogen assets ship with the game. To rebuild them on macOS, run `python3 scripts/prepare-mars-map.py MOLA_cylin.jpg hend_epithermal_020917.tab` with the two source files.

## Weather

The landing map lets you choose a start season and compare expected storm sols and cold exposure at your site. Quick start uses Gale Crater at Lₛ 0°. Each mission follows a seeded historical dust year. The forecast strip shows the archived OpenMARS conditions for each sol (clear, dust haze, ice clouds, wind, dust devils, fog, snow, severe cold, and local, regional or global dust storms). Hover a sol, or click to keep it open, to see temperature, wind, pressure, and the effects on solar power, habitat heat, and ice extraction.

Dust dims sunlight and coats solar panels. Select a panel to clean it. Batteries and load priorities can keep greenhouses and water equipment running through storms. Cold raises heating demand and slows the ice drill. A greenhouse that keeps its power and water can keep growing through either hazard.

See [Weather data and API](docs/weather.md) for source coverage, game tuning, and the forecast contract.

## Team handoff

| Owner | Work | Integration point |
|---|---|---|
| Tolui | Core gameplay | Phaser scenes in `src/scenes/` call `Simulation.command()` and read `Simulation.state`. |
| Kelton | Weather and events data | The bundled archive supplies dust and seasonal conditions. `sim.getWeather()` and `sim.forecastWeather()` expose current and projected conditions. |
| Edwin | Plant genetics and mutations | `public/data/crops.json` supplies baseline traits, and `src/sim/systems/crops.js` owns growth and harvest. A planted crop is tied to its plot with `plotUid`; mutation and inheritance logic can extend that state. |

The [original playbook](Junior%20Astronaut%20Mars%20Farm%20README.md) describes the full project and source IDs. The NASA baseline crop data comes from the [Life Support Baseline Values and Assumptions Document](https://ntrs.nasa.gov/citations/20210024855). The seasonal calendar uses the [LMD solar longitude table](https://www-mars.lmd.jussieu.fr/mars/time/solar_longitude.new). Prices and resource tuning are game values.

OpenAI Codex assisted with the project scaffold, simulation, scenes, starter data encoded from the playbook, and tests.

## Credits

- Fonts are bundled from npm (no CDN), and both are licensed under the [SIL Open Font License 1.1](https://openfontlicense.org/):
  - [Amatic SC](https://github.com/googlefonts/AmaticSC) by Vernon Adams and The Amatic SC Project Authors (display face: titles, tab labels, headings), via [`@fontsource/amatic-sc`](https://fontsource.org/fonts/amatic-sc).
  - [Patrick Hand](https://fonts.google.com/specimen/Patrick+Hand) by Patrick Wagesreiter (body text and all numbers), via [`@fontsource/patrick-hand`](https://fontsource.org/fonts/patrick-hand).
