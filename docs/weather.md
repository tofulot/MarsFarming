# MarsFarming weather handoff

Implemented on `Kelton-Branch`, based on the supplied Junior Astronaut README and the user's 2026 challenge description. Research checked November 14, 2026. Code, tests, data transcription and this guide were assisted by OpenAI Codex.

The starting repository contains two identical planning READMEs. This branch supplies a standalone weather system, a GameState adapter, sourced reference observations, tests and an executable integration example. Connecting it to the team's future Simulation and Phaser scenes is the remaining integration step.

## Challenge fit

Weather makes the mission's power budget, equipment mass, crop schedule and lifetime interact. A player can pack batteries, reserve power for heating, clean panels, or choose shorter crops before dust season. The report can attribute shortages to storm dates and show which decisions preserved crop production. This supports the configuration, resource management, consequences and mission-evaluation requirements in the challenge text supplied by the user. The official challenge page returned HTTP 502 during research. [Official challenge](https://www.spaceappschallenge.org/2026/challenges/space-mission-design-game/)

## Decisions already in the README

| Decision | Existing design | Weather implementation |
|---|---|---|
| Crop environment | Climate-controlled soil greenhouses and hydroponic bays | Outside conditions change climate-control demand |
| Clock | One simulation tick per sol | Caller advances the clock once, weather processes that sol |
| Crop needs | PPF, target temperature and duration | Demand and planting-advice functions accept these fields |
| Weather | Seasonal dust, accumulated panel dust, cold snaps, Hard global storm | Seeded event lifecycle and persistent panel dust |
| Player response | Batteries, cleaning, power priority, crop choice | Solar output, cleaning command hook and planting advice |
| Difficulty | Easy/Medium warnings, Hard immediate events | One-sol warnings for Easy and Medium |

The README gives enough decisions for this module. Provisional tuning introduced here includes cold/global event rates, temperature-model coefficients, watts per PPF and degree, a minimum cleanliness floor, and storm communications factors. Each is marked as a game value in `public/data/weather.json`.

## Data found

| Source | Location and variables | Use |
|---|---|---|
| MEDA | Jezero air/ground temperature, pressure, wind, humidity and radiation/dust | Best archive for Jezero. Use ATS air temperature for heating inputs and preserve quality flags. [PDS MEDA](https://pds-atmospheres.nmsu.edu/data_and_services/atmospheres_data/PERSEVERANCE/meda.html) |
| REMS | Gale environmental measurements | Site-specific archive for Gale. [PDS Curiosity](https://atmos.nmsu.edu/data_and_services/atmospheres_data/MARS/curiosity/curiosity.html) |
| InSight TWINS and PS | Elysium wind, temperature and pressure | Historical archive with documented coverage gaps associated with power constraints. [PDS InSight](https://pds-atmospheres.nmsu.edu/data_and_services/atmospheres_data/INSIGHT/insight.html) |
| NASA fact sheet | Orbit, sol length, global reference temperature, Viking ranges | Physical constants and reference cards. [NASA fact sheet](https://nssdc.gsfc.nasa.gov/planetary/factsheet/marsfact.html) |
| Mars24 and LMD | Solar longitude and unequal season lengths | Calendar and approximate solar geometry. LMD is the non-NASA Mars Climate Database team. [Mars24](https://www.giss.nasa.gov/tools/mars24/help/notes.html), [LMD calendar](https://www-mars.lmd.jussieu.fr/mars/time/solar_longitude.html) |

Four compact summaries are bundled in `public/data/weather-observations.json`. NASA reports an initial Jezero pressure of 718 Pa and surface temperature changing from approximately −20 °C to −25.6 °C over 30 minutes. A later combined report for mission sols 43–44 gives −83 °C to −22 °C and gusts near 10 m/s. The JSON preserves these different measurement periods. The fourth reference contains the fact sheet's Viking 1 diurnal range. [NASA MEDA report](https://www.nasa.gov/directorates/stmd/nasas-first-weather-report-from-jezero-crater-on-mars/), [NASA fact sheet](https://nssdc.gsfc.nasa.gov/planetary/factsheet/marsfact.html)

These summaries support fact cards. Annual gameplay uses a clearly labeled synthetic temperature model anchored to the NASA global reference. A caller can supply a screened, same-site air-temperature observation to override a sol's temperature. The override uses the midpoint of its min/max as a heating approximation. A full annual observation series is a future data enhancement. The supplied summaries retain the article's sensor descriptions and are unsuitable for automatic conversion into air-temperature observations.

For a future archive import, select calibrated ATS/REMS/TWINS products, read their labels for units and missing-value/quality codes, group valid observations by mission sol, convert Kelvin to Celsius where required, and retain instrument, site, coverage and product URL. Use air temperature for greenhouse heat-loss inputs. Preserve missing values in the source dataset and choose the labeled synthetic fallback for uncovered sols. Match mission sols to Ls through archive ancillary data before seasonal replay. The MEDA archive exposes separate calibrated sensor indexes. [PDS MEDA indexes](https://pds-atmospheres.nmsu.edu/data_and_services/atmospheres_data/PERSEVERANCE/meda.html)

## Effects and player decisions

| Condition | Output | Gameplay consequence | Player response |
|---|---|---|---|
| Regional storm | Solar ×0.4 for 10–30 sols | Less power for lights, heating, drills and science | Batteries, prioritize loads, shorter low-PPF crops |
| Global storm, Hard | Solar ×0.05 for 40–60 sols, at most once per mission | Long resource shortfall | Reserves and the README's optional nuclear power |
| Deposited panel dust | Cleanliness ×0.997 each sol | Persistent generation loss | Clean selected panels |
| Cold snap | Heating demand ×1.5 for 5 sols | Higher greenhouse power requirement | Reserve power and reduce competing loads |
| Latitude and season | Approximate clear-sky solar factor | Changes site and planting trade-offs | Compare site and planting dates |
| Dust-season overlap | Crop-duration exposure and regional-event risk estimate | Long crops experience more opportunities for disruption | Compare lettuce/radish with potatoes or wheat |

Event odds, durations, multipliers and demand coefficients are game values. Dust's reduction of sunlight has a measured mission basis. NASA also reports dust storms retaining heat, so this model treats cold snaps as a separate event. [Opportunity storm report](https://www.jpl.nasa.gov/news/opportunity-hunkers-down-during-dust-storm/)

A controlled greenhouse can keep crops healthy through a storm when its needs are met. The crop owner applies the README's difficulty rules after power allocation, water and soil checks. A planting warning describes conditional risk. Batteries or other generation can support potatoes through dust season.

The storm `commsFactor` represents a provisional reduction in operational downlink allocation. Its interpretation is a gameplay resource trade-off. A value of 1 disables that balancing effect. Pressure and gust measurements are educational reference fields in this version. Solar-particle radiation, equipment breakdowns and soil chemistry belong to the corresponding team systems.

## Files and verification

| File | Responsibility |
|---|---|
| `src/sim/systems/weather.mjs` | Pure weather, solar, panel and crop-demand functions |
| `src/sim/weatherAdapter.mjs` | GameState integration and panel cleaning |
| `public/data/weather.json` | Source URLs, constants and tunable balance |
| `public/data/weather-observations.json` | Four historical reference summaries |
| `test/weather.test.mjs` | Determinism, boundaries, effects and adapter regressions |
| `examples/weather-demo.mjs` | Runnable 669-sol integration example |

Run these commands from the repository root with Node 18 or later. `.mjs` provides explicit ES-module semantics while the team's package scaffold is being developed.

```sh
node --test test/weather.test.mjs
node examples/weather-demo.mjs
```

Verification covers 669 sols × six site latitudes × three difficulties, JSON save/restore, storm lifetimes, warnings, hemisphere changes, polar night, planting across year boundaries, dust, cleaning and atomic adapter updates. Arcadia's 45° latitude in the test is a labeled fixture because its exact landing point remains a data-team choice.

## Simulation integration

Load `weather.json` and `weather-observations.json` alongside the team's existing data. Phaser's planned BootScene can use the same base URL convention from the README.

```js
this.load.json('weather', `${import.meta.env.BASE_URL}data/weather.json`);
this.load.json('weatherObservations', `${import.meta.env.BASE_URL}data/weather-observations.json`);
```

After the existing season system advances `state.sol` and `state.Ls`, call the adapter before the power system. It attaches `state.weather`, updates solar panel dust and assigns the weather factor to `state.power.solarFactor`. The adapter recognizes the building ID `solarArray`, which the team should use consistently in `buildings.json`.

```js
import { applyWeather, cleanWeatherPanel } from './weatherAdapter.mjs';
import { panelOutputW, cropWeatherDemand } from './systems/weather.mjs';

const messages = applyWeather(state, selectedSite, data.weather);
for (const message of messages) bus.emit(message.type, message.event);

// In powerSystem, per solar array. Its dust value already includes this sol's deposition.
const solarW = panelOutputW(buildingDefinition.powerW, panel.dust, state.weather);

// In the power-demand calculation, per planted greenhouse slot.
const climate = cropWeatherDemand(cropDefinition, state.weather, data.weather);
// climate.lightW and climate.heatW become the crop's climate loads.

// In the existing command dispatcher, after validating any cleaning cost.
const result = cleanWeatherPanel(state, command.uid);
```

The README's 800/1,200 W greenhouse loads are undivided starting budgets. During integration, the sim owner should replace their climate portion with `climate.totalW` and retain separately specified pumps or other overhead. This prevents counting the same light and heating demand twice. Crop definitions need a finite `tempDayC`; pepper's missing target remains a data-team decision and produces a clear input error until supplied.

The adapter's first call accepts older GameState objects without weather or panel dust. Subsequent calls require consecutive sols. Repeating a sol produces no duplicate messages or dust. Fast-forward should call the complete simulation once for each sol. Save `state.weather` with the rest of GameState to preserve pending events and the global-storm cap. Re-fly starts with a fresh state and seed.

Weather owns `dustRegional`, `dustGlobal` and `coldSnap`. Route those event types through this module when assembling the generic event system. Its active and pending lists live under `state.weather`. The returned messages use `event:start`, `event:end`, and the added `weather:warning`. The simulation owner can append those messages to the existing event log for the mission report.

Optional observation input has this contract. The values below illustrate the schema with a synthetic fixture.

```js
applyWeather(state, selectedSite, data.weather, {
  siteId: selectedSite.id,
  airTempMinC: -80,
  airTempMaxC: -20,
  coverage: 'Synthetic example, replace with screened archive coverage',
  sourceUrl: 'https://example.test/fixture'
});
```

## UI handoff

The UI owner can display season, sol, approximate Ls, outside temperature and `temperatureBasis`, solar output, panel cleanliness, active events and pending warning dates. Keep the provenance label visible in the weather panel. The approximate noon solar proxy follows the README and provides a relative game factor. Daily energy and battery accounting need the sim owner's consistent power-time convention.

Call `plantingAdvice(crop, state.weather, data.weather, availableClimateW)` for each crop menu option. Pass the watts actually available to that slot after other committed loads. Show the current demand, whether that budget covers it, and dust-season sols during the growth window. The returned probability is an independent-roll game estimate for regional storm exposure. It includes the full growth horizon but does not forecast the power available on each future sol.

Warnings should explain the choice, for example “Regional dust storm next sol. Solar generation falls to 40%. Reserve power for heating and lights.” The crop panel can explain “This crop needs more lighting power” or “This growth period overlaps dust season.” Feed event start/end dates and player cleaning decisions into the existing mission report.
