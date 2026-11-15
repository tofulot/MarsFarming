# Shared weather API

The shared JavaScript interface is implemented in `src/weather/index.js` and connected to the game imported from `red-harvest/mvp` at `a85f5cc`. It runs in the browser and Node. The API accepts plain objects, returns independent snapshots, and exposes `version: 1`.

## Use from the running game

`Simulation` constructs the API and connects it to the sol loop and power system. Teammates can query it immediately after creating a simulation.

```js
const weather = sim.getWeather();
const forecast = sim.forecastWeather(7);
const crop = data.crops.find(crop => crop.id === 'lettuce');

const effects = sim.weather.cropEffects(crop, weather, {
  basePowerW: 800,
  includedPpf: 28
});
// effects contains baseW, lightW, heatW and totalW.

const advice = sim.weather.plantingAdvice(crop, weather, 1500, {
  basePowerW: 800,
  includedPpf: 28
});
// 1500 is the power available to this slot after other loads.
// advice includes powerSufficientNow, powerFit, stormSeasonSols and regionalStormRisk.

const solar = sim.weather.powerEffects({
  weather,
  ratedW: 3000,
  dust: 0.1
});
// solar.generationW is projected output with the supplied panel dust.
```

Use the selected building's `-powerW` as `basePowerW`. The current game includes lighting up to PPF 28 in that building budget. The interface accepts this allowance per call, so future building definitions can supply different values. The live power system already calls these methods and applies their results to load allocation. The crop system observes `plot.online` to determine growth and stress.

Forecasts cover the next requested sols. Each day has the same shape as `getWeather()`, with `sol`, `Ls`, `season`, `outsideTempC`, `solarFactor`, `dustFactor`, `heatingFactor`, `commsFactor`, and `active`. The result has `kind: 'projection'` and a `basis` string. Queries leave resources, event RNG and the mission clock unchanged.

`sim.getWeather()` reads the current event list, including a just-triggered demo event. `sim.state.weather` holds the snapshot from initialization or the most recent sol. UI callers should use `getWeather()` when they need to reflect an event command immediately.

### Forecast UI contract

Use `[sim.getWeather(), ...sim.forecastWeather(15).days]` for a 16-cell timeline. Read `day.primary` for the current label and `day.conditions.storm` for a dust alert. The archive adds the following fields to API v1. They are optional for legacy fixtures.

| Field | Meaning |
| --- | --- |
| `archiveYear`, `dustOpticalDepth`, `cloudOpticalDepth` | Selected Mars year, local equivalent visible dust optical depth, and climatological CRISM water-ice optical depth at 3.3 μm |
| `primary`, `conditions` | Display label and independent flags for `storm`, `haze`, `windy`, `cold`, `waterIceCloud`, `co2Cloud`, `fog`, `frost`, `snow`, `dustDevil`, `dustSparks`. Storm IDs are `dustLocal`, `dustRegional`, and `dustGlobal`. Frost and snow use `water` or `co2`. Absent storms, frost, and snow are `null`. |
| `outsideTempC`, `airMinC`, `airMaxC`, `pressurePa` | Near-surface mean and diurnal range in °C and surface pressure in pascals |
| `windSpeedMs`, `windEastMs`, `windNorthMs` | Mean speed and prevailing wind vector components in m/s |
| `atmosphereFactor`, `habitatHeatW`, `iceDrillFactor` | Fraction of clear-sky solar output before panel deposits, extra habitat watts, and fraction of the site's powered drill yield |
| `active` | Archive storm intervals and known events. Intervals are `[startSol, endSol)`. Severe cold adds a `coldSnap` marker for that sol. An arriving storm satisfies `event.startSol === day.sol`. |

Use `conditions.storm` or the storm IDs for alerts. `dustFactor` also reflects background haze. `solarFactor` includes the site’s solar geometry. `WeatherLayer` can be mounted independently of the forecast. Give it the current weather via `setWeather()` and call `update(time)` from the colony render loop.

## Public interface

| Method | Inputs | Result |
|---|---|---|
| `current(input)` | Sol, site, optional seed/difficulty/Ls/events/observation | Weather snapshot |
| `forecast(input, { sols })` | Same input, future sol count | `{ kind, basis, days }` |
| `powerEffects({ weather, ratedW, dust, advanceDust })` | Panel and conditions | `{ generationW, dust, solarFactor, _game }` |
| `cropEffects(crop, weather, load)` | Effective crop traits and optional base load | `{ baseW, lightW, heatW, totalW, _game }` |
| `plantingAdvice(crop, weather, availableClimateW, load)` | Crop, conditions and power budget | Demand, current power fit and duration-based regional-storm risk |
| `advance(previous, input)` | Previous standalone weather snapshot and next sol | `{ weather, messages }` from the seeded weather scheduler |
| `getConfig()` | None | Independent configuration copy |
| `getSources()` | None | Source IDs and URLs |
| `getObservations(siteId)` | Optional site ID | Independent copies of archived reference records |

`current()` and `forecast()` use events supplied by their caller. With the bundled archive, atmospheric events come from the data provider and `eventSystem` handles other scripted and random events. With legacy datasets, `eventSystem` also schedules atmospheric events. The standalone `advance()` method supplies scheduling, including warnings and saveable event state. In that mode, initialize with an undefined previous snapshot, advance one sol at a time, and save the returned weather object. Repeated calls for the same sol produce no duplicate messages.

`advanceDust` defaults to false for queries. The live power system sets it to true once per powered solar array per sol and stores the returned dust. The cleaning command sets that panel's dust to zero. This keeps forecasts and UI queries from advancing panel wear.

## Use in another module or branch

Load the configuration using the team's existing data loader. Browser fetches should honor the application's base URL.

```js
import { createWeatherAPI } from './src/weather/index.js';

const response = await fetch(`${import.meta.env.BASE_URL}data/weather.json`);
if (!response.ok) throw new Error(`Weather config load failed (${response.status})`);
const config = await response.json();
const api = createWeatherAPI({ config });
const input = {
  sol: 100,
  site: { id: 'jezero', lat: 18.44 },
  seed: 42,
  difficulty: 'medium',
  events: []
};
const weather = api.current(input);
const forecast = api.forecast(input, { sols: 10 });
```

Paths in examples are relative to the repository root. Adjust import paths for the calling module. The module uses standard ES imports and has no Phaser dependency.

The canonical active-event shape is shown below. Time intervals include `startSol` and end just before `endSol`. Omit `endSol` for an event with unknown duration. The forecast carries such an event forward.

```js
{
  id: 'dustRegional',
  startSol: 100,
  endSol: 110,
  effects: { solarFactor: 0.4, heatingFactor: 1, commsFactor: 1 }
}
```

The Red Harvest adapter translates its existing `until` to `endSol` and `heatFactor` to `heatingFactor`. Concurrent effects use the lowest solar/comms factor and highest heating factor, preserving the game's current composition rule. Other event fields, including equipment targets and fact text, remain available to their owning systems.

## Change the design without changing callers

`src/weather/redHarvest.js` contains the game-specific mapping. This is the place to update when teammates rename event fields or change their data organization. `src/weather/index.js` provides the stable public methods. The original pure functions and legacy adapter remain available to earlier callers.

Configuration is copied when constructing an API. Named sections merge field by field, individual difficulty entries merge, and arrays such as `events` replace the complete array. Construct a new instance when loading new tuning. Inputs and returned copies can be edited without changing the API's internal configuration.

```js
const api = createWeatherAPI({
  config,
  overrides: {
    balance: { heatWattsPerDegree: 4 },
    difficulties: { easy: { eventMult: 0.25 } },
    events: []
  },
  models: {
    temperature: ({ sol, site, Ls, config }) => myTemperatureModel(sol, site, Ls, config),
    solar: ({ site, Ls, config }) => mySolarModel(site, Ls, config)
  }
});
```

The model callbacks return finite numbers. Solar output must be nonnegative. They receive copied context and should compute deterministically from their inputs. This supports replacing the simple temperature model with a screened seasonal dataset while retaining the same UI and crop calls.

For the integrated game, the existing `seasons`, `balance`, `difficulty`, and `events` datasets take precedence over bundled weather defaults. This preserves the current game's temperature curve, dust accumulation and load budgets. Explicit per-simulation overrides win last.

```js
const sim = new Simulation(data, {
  siteId: 'gale',
  difficulty: 'easy',
  weather: {
    overrides: { balance: { heatWattsPerDegree: 4 } },
    models: { temperature: ({ Ls }) => mySeasonalTemperature(Ls) }
  }
});
```

External scheduling in Red Harvest uses `data.events` and `data.difficulty`. The archive provider controls replay dates, and its tuning table controls atmospheric dimming, panel deposits, and cold loads. The shared interface's event configuration supports standalone scheduling and the legacy planting-risk estimate.

For Edwin's crop genetics work, pass the effective traits after mutations into `cropEffects()` and `plantingAdvice()`. The API reads `ppf`, `tempDayC`, and `growthSols` from each supplied object. Trait changes are reflected immediately. Missing numeric crop targets raise a clear error. The gameplay owner can decide how mutations alter growth or stress using those demand results.

## Current coordination

| Owner | Integration |
|---|---|
| Kelton | Shared interface, weather configuration, source records and compatibility adapter |
| Gameplay/UI | `sim.getWeather()`, `sim.forecastWeather()`, and `sim.weather` query methods |
| Crop genetics | Effective crop traits passed into the demand/advice functions |
| Game simulation | Existing clock/events plus API-derived solar generation and climate loads |

`BootScene` loads `weather.json` and `weather-observations.json` with the game's base URL. Existing headless callers can still construct `Simulation` with the original game datasets. The adapter derives its defaults from those datasets when weather metadata is absent.

The economy system calculates throughput from powered dishes and supplied event factors. Archived dust affects downlink through available power. Demo and legacy events can supply direct comms factors.

## Data and scientific meaning

The browser loads `public/data/mars/weather-archive.json` and its compressed payload. `Simulation` takes an optional `landingLs` of 0, 90, 180, or 270 degrees. Mission sols start at zero while the solar calendar starts at the selected season. The seed selects a starting Mars year from MY25–36. The replay advances to the next archived year at the equinox, cycling MY36 to MY25.

- **Dust.** Daily 3° reconstructed Montabone maps replay NASA TES, THEMIS, and MCS retrievals for MY25–36. The extract samples `cdodtot` onto a 10° grid and stores infrared absorption depth in steps of 0.002. The API uses the published 2.6 conversion to equivalent visible depth. Fields are reconstructed through missing orbital coverage and can miss small or short-lived storms. The CDOD extract is CC BY-SA 3.0. [LMD archive](https://www-mars.lmd.jussieu.fr/mars/dust_climatology/)
- **Storm labels.** Elevated dust requires normalized CDOD at least 0.09 and 48% above the local 10° solar-longitude median of nine years without global storms. Native-grid detections that overlap in successive frames share a track, including across the longitude seam. A track of at least three sols with a daily footprint of at least 1.6 million km² is labeled regional on that day. Global intervals use published event dates for MY25, MY28, and MY34. A comparison against the MY30 MARCI catalog found 766 overlapping storm cell-sols among 3,083 inferred and 8,465 cataloged cell-sols on common coverage. The labels are approximate, particularly for local storms. [Global storm comparison](https://doi.org/10.1029/2019JE006104) · [MDAD masks](https://zenodo.org/records/7480334) · [Regional storm definition](https://doi.org/10.1016/j.icarus.2020.114059)
- **Meteorology.** Eight 10-sol windows from MY30 OpenMARS v3 provide the near-surface diurnal temperature range, wind, pressure, ground minima, and CO₂ surface ice. The importer reads the lowest atmospheric sigma level. The game interpolates the seasonal summaries and adds seeded temperature variation scaled to the reanalysis spread. These are gridded estimates informed by NASA orbital data. The OpenMARS extract is CC BY 4.0. [OpenMARS](https://doi.org/10.21954/ou.rd.24573205.v3)
- **Ice and small-scale weather.** The cloud climatology bins NASA CRISM retrievals by location and 30° Lₛ after rejecting extreme opacity outliers. It uses zonal means where observations are sparse. Frost, fog, snow, dust devils, and dust sparks use modeled conditions and deterministic seeds. The game represents Phoenix-like water-ice fall streaks and south-polar CO₂ snowfall in their documented regimes. Cloud dimming, heating and water losses, panel fouling, and visual intensity are game tuning. [CRISM archive](https://doi.org/10.17189/76ha-be75) · [Frost observations](https://doi.org/10.1002/2016JE005034) · [Phoenix snow](https://www.jpl.nasa.gov/news/nasa-phoenix-results-point-to-martian-climate-cycles/) · [CO₂ snow](https://www.jpl.nasa.gov/news/nasa-observations-point-to-dry-ice-snowfall-on-mars/) · [Dust sparks](https://www.nasa.gov/missions/mars-2020-perseverance/perseverance-rover/nasa-rover-detects-electric-sparks-in-mars-dust-devils-storms/)

MEDA provides Jezero temperature, pressure, wind, humidity and radiation/dust data. REMS provides Gale environmental measurements. InSight supplies historical Elysium temperature, wind and pressure records. These archives support a future screened dataset provider. [MEDA archive](https://pds-atmospheres.nmsu.edu/data_and_services/atmospheres_data/PERSEVERANCE/meda.html), [REMS archive](https://atmos.nmsu.edu/data_and_services/atmospheres_data/MARS/curiosity/curiosity.html), [InSight archive](https://pds-atmospheres.nmsu.edu/data_and_services/atmospheres_data/INSIGHT/insight.html)

The calendar uses LMD's unequal 30° solar-longitude intervals. Orbital constants and reference values come from NASA's fact sheet and Mars24. [LMD calendar](https://www-mars.lmd.jussieu.fr/mars/time/solar_longitude.html), [NASA fact sheet](https://nssdc.gsfc.nasa.gov/planetary/factsheet/marsfact.html), [Mars24](https://www.giss.nasa.gov/tools/mars24/help/notes.html)

The bundled Jezero summaries preserve initial pressure and surface readings separately from the combined sols 43–44 report. Importing archived air temperatures requires checking sensor type, units, quality flags, coverage and site. A `current()` observation override requires `siteId`, `airTempMinC`, `airTempMaxC`, `sourceUrl` and `coverage`; its midpoint supplies an approximate outside temperature for that sol. Forecasts resume the configured model on subsequent sols. [NASA MEDA report](https://www.nasa.gov/directorates/stmd/nasas-first-weather-report-from-jezero-crater-on-mars/)

For a surface check, the early-season OpenMARS grid gives about 702 Pa at Jezero, compared with MEDA's initial 718 Pa. Around Lₛ 28°, the sampled mean diurnal range is roughly −83 to −40 °C. NASA reported −83 to −22 °C over sols 43–44. The coarse cell and seasonal averaging smooth the local daytime high. [NASA MEDA report](https://www.nasa.gov/directorates/stmd/nasas-first-weather-report-from-jezero-crater-on-mars/)

Weather creates the README's engineering trade-offs through power generation, heating demand and the crop growth window. A well-supplied greenhouse can continue growing during a storm. Players respond with batteries, cleaning, load priorities and crop selection. The supplied 2026 challenge text remains the project brief; the official page returned HTTP 502 during the earlier research. [Challenge page](https://www.spaceappschallenge.org/2026/challenges/space-mission-design-game/)

## Run and verify

To regenerate the archive, install `numpy`, `scipy`, `netCDF4`, and `numcodecs`, then run `python3 scripts/prepare-mars-weather.py /path/to/source-files`. Prepare the source folder as follows.

- Download the twelve `dustscenario_MY*_v*.nc` daily **kriged** files for MY25–36 from the LMD archive. Extract `MY30/MDADMY30.nc` from the MDAD `MY30.tar.gz` into the source directory.
- Download `Khayat2023_nadir_water_ice_opacity.csv` from [NASA’s CRISM data directory](https://atmos.nmsu.edu/PDS/data/PDS4/mro-crism_atmos-db/data_derived/).
- Under `openmars/`, retain the `openmars_MY28-35.zarr/` child paths from the [ARCO-OpenMars snapshot](https://huggingface.co/datasets/ananyo01/ARCO-OpenMars/tree/c3cceb62eaedd44981e261d5004ee9f2a96eda3c/openmars_MY28-35.zarr). Get `lat/c/0`, `lon/c/0`, `lev/c/0`. For each chunk `i` in `135 145 154 163 172 179 186 193`, get `Ls/c/i` and `MY/c/i`, `temp/c/i/0/0/0`, `u/c/i/0/0/0`, `v/c/i/0/0/0`, and `tsurf/c/i/0/0`, `ps/c/i/0/0`, `co2ice/c/i/0/0`. The Zarr files are a lossless packaging of OpenMARS v3.

```sh
npm install
npm test
npm run build
node examples/weather-api-demo.mjs
```

On the development host, Vite’s default config-bundling step stalled. `npm run build -- --configLoader native` completed successfully and produced the browser bundle and weather JSON assets.

Tests cover the existing game loop, a Mars year across all sites and difficulties, deterministic saves, event boundaries, immutable forecasts, data mapping, tuning overrides and crop stress caused by API-derived power demand. OpenAI Codex assisted with this implementation, data transcription, tests and documentation.
