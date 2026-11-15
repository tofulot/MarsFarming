# Red Harvest — Master Plan for the final 8 hours

Written 2026-11-14 ~23:45 PST for agents and teammates continuing work on `tofulot/MarsFarming`.
Target: a **workable demo** for NASA Space Apps 2026, challenge "Space Mission Design Game".

Read sections 1–4 before touching code. Then take one lane from section 5.

> **Decisions taken (2026-11-14 23:50):**
> - Relevance: **option C**. The team will submit to "Build a Junior Astronaut Mission Trainer". **WP-R is dropped.**
> - Scope: **P0 + P1**. WP-F and WP7 extras are out.
> - WP4 merges credits with mined regolith/metal and wreck salvage into one "Build materials (kg)" pool.
> - WP6 enlarges both the Base/Ops/Goals tabs and the shop item icons.
> - Step 0 is done: branch `red-harvest/integration` exists locally (merge of `main` into `UI-Overhaul`, 80 tests pass).

---

## 1. Ground rules

1. **Do not break the working game.** Every patch must leave `npm test` and `npm run build` green.
2. **Branch from `red-harvest/integration`** (created in Step 0). Never branch from `main` or `UI-Overhaul` directly.
3. **Stay in your lane's files** (section 5). If you must touch another lane's file, keep the change to a few lines and say so in the commit message.
4. **Small commits, landed often.** Land something every 60–90 minutes. A half-finished lane that never merges is worth nothing.
5. **Label game values honestly.** The repo convention: real values cite a source; tuned values are called game values. Keep it. The Validity criterion depends on it.
6. **AI disclosure.** Keep the `// AI-assisted (...)` header on files you create or heavily edit. Draw art in code (Phaser Graphics, SVG, canvas). Do not add AI-generated image files, and do not use NASA logos or mission insignia anywhere.
7. **Feature freeze at T+5:30.** After that, only bug fixes.

---

## 2. What the challenge asks for

Sources: the official page could not be fetched (it blocks automated readers), so this is from a GitHub mirror of the brief, a local-event page, and the Space Apps judging and submission guides. Someone on the team should open the official page's Resources tab once and confirm the dataset list.

**The brief.** Build an interactive game where 1–4 players design, manage and simulate a complete space mission: define the objective, design the spacecraft and payload, choose launch vehicle and orbit, manage budget / mass / power / communications / data / duration, simulate, then modify the design and run again. It should teach *why* each trade-off matters.

**Judging criteria (all five count):** Impact, Creativity, Validity (is it scientifically sound), Relevance (does it answer the challenge it was submitted to), Presentation.

**Submission needs:** a public demo link (video up to 30 seconds, or up to 7 slides), a public project link, a NASA Data field, a partner/other data field, and an AI-use disclosure. The submission guide says Global Award eligibility requires using NASA data or resources. The guide page still showed 2025 dates when checked, so re-read the 2026 version before submitting.

### The Relevance gap (team decision needed)

The shipping build goes Title → (optional landing site) → colony survival. The "design the mission" half of the brief is mostly unreachable:

- `src/scenes/BriefScene.js` (objective + difficulty) exists but is **not registered** in `src/main.js`.
- `src/sim/design.js` `checkManifest` (lander capacity, payload mass, budget) and `public/data/landers.json` exist, and `Simulation` accepts `landerId` + `manifest`, but **no UI reaches them** and rescue mode's 180 starting budget cannot afford any lander (cheapest costs 300).
- The repo's own playbook (`Junior Astronaut Mars Farm README.md`) promises Mission Brief, lander and payload manifest. The submission text must not claim what a judge cannot click.

None of the ten requested fixes closes this gap. Options, cheapest first:

| Option | Cost | What judges see |
|---|---|---|
| A. Pitch only | 0 h | Frame site + season choice as the mission design, and show "Redesign and re-fly" on the report. Weakest. |
| B. Mission design lite (WP-R, section 5) | ~2 agent-hours | One pre-landing screen: objective, lander, payload kit, with mass and budget bars. Uses existing sim code. |
| C. Switch challenge | 0 h code | "Build a Junior Astronaut Mission Trainer" (run a lunar or Martian outpost balancing life support, shielding, power, food) describes this game more directly. Only if the platform still lets the team change challenge; not verified. |

Recommendation: decide between B and C in the first 30 minutes. If neither, do A and write the pitch accordingly.

### Data: what counts as NASA

| Data in the repo | Origin | Submission field |
|---|---|---|
| MOLA shaded relief (`public/data/mars/terrain.jpg`) | NASA Mars Global Surveyor, via NASA Ames | NASA Data |
| HEND epithermal neutron grid (`neutron-flux.json`) | NASA Mars Odyssey, NASA PDS archive (instrument built by Russia's IKI) | NASA Data, note the instrument origin |
| Crop baseline values (`crops.json`) | NASA Life Support Baseline Values and Assumptions Document | NASA Data |
| Soil chemistry profiles (`soils.json`), weather reference cards (`weather-observations.json`) | NASA mission results (Phoenix, MEDA, etc.) | NASA Data |
| Dust climatology (`dust-climatology.json`) | LMD Mars Climate Database, France; built from NASA orbiter observations; CC BY-SA 3.0 | Partner & Other Data |
| OpenMARS weather archive (`weather-archive.bin.gz`, main only) | Open University, UK; reanalysis of NASA orbiter data | Partner & Other Data |

The NASA requirement is already met. New map generation (WP7) should use the **bundled NASA sets** (MOLA, HEND) so the "real data" claim stays simple and true.

---

## 3. Repo state (verified tonight)

| | `main` (b9a0f00) | `UI-Overhaul` (1c3a0a3) |
|---|---|---|
| Commits since fork point 64599b4 | 6: OpenMARS weather archive, WeatherLayer visuals, frost, map outlook | 4: DOM HUD, Base/Ops/Goals panels, rationing, power groups, compact forecast strip |
| Tests | 73 pass | 69 pass |
| UI | Old Phaser header + side panels | New DOM HUD (`src/ui/colony/ResourceHud.js`) |

- **They merge with 3 small conflicts.** The merged result passes **80 tests** and builds. Recipe in section 4.
- `fact-cards-milestones` has 5 unmerged commits (NASA fact cards + helper mascot, 534 lines, good for the education angle). It conflicts in `ColonyScene.js`. Optional, see WP-F.
- `Kelton-Branch`, `mutation`, `weather-overhual` are fully contained in `main`. Ignore them.
- CI (`.github/workflows/check.yml`) runs on pull requests and on pushes to `main` and `red-harvest/**`. That is why the integration branch is named `red-harvest/integration`.

### Things every agent must know

1. **DOM sits on top of the canvas.** The HUD, shop panel, message toast and forecast strip are DOM elements over the Phaser canvas. Anything Phaser draws underneath them is invisible, whatever its depth. Several bugs below are this.
2. **Two shop implementations exist.** The live one is DOM (`ResourceHud.renderBase`). The old Phaser one (`ColonyScene.drawBaseShop`, the timers and achievement-tree branches of `drawDetails`) is dead code when the HUD is mounted. Phaser `drawDetails` is still live for a *selected building* and for rocks/wreck (`surfaceActions.drawSurfaceDetails`).
3. **The board starts under the HUD.** `colonyLayout.board.y` is 60, but the HUD bars cover y 8–121. Board rows 0 and 1 are hidden and unclickable.
4. **Demo hotkeys fire while typing.** With `?demo=1`, `ColonyScene` binds `1`, `2`, `F`, `]`, `R`. Typing those letters in the colony-name dialog triggers them; `R` ends the mission.
5. `drawActionDock` is a stub that returns `[]`. Don't build on it.
6. Canvas design size is 1280×720. The HUD root is scaled to match, so use those coordinates.

---

## 4. Step 0 — integration branch (blocks everything, ~20 min, one person with push rights)

```sh
git fetch origin
git checkout -b red-harvest/integration origin/UI-Overhaul
git merge origin/main
```

Three files conflict. Resolve exactly like this:

| File | Resolution |
|---|---|
| `src/ui/colony/ForecastStrip.js` | Keep the **UI-Overhaul** side entirely (`git checkout --ours`). |
| `src/sim/Simulation.js` | Keep the **UI-Overhaul** side (the two sides differ only in a variable name). |
| `src/scenes/ColonyScene.js`, hunk 1 (in `create`, the `header` group with `colonyTitle`, `solProgress`, zoom buttons) | Keep the **UI-Overhaul** side (empty). The DOM HUD replaces that header. |
| `src/scenes/ColonyScene.js`, hunk 2 (in `update`) | Replace the whole hunk with these two lines: `const progress = Math.min(1, this.acc / tick);` and `this.presentation?.update(time, progress);` Do not keep `solProgress` or `solStatus`; they belonged to the removed header. |

```sh
npm install && npm test        # expect 80 passing
npm run build                  # expect success (one large-chunk warning is normal)
git commit && git push -u origin red-harvest/integration
```

Smoke test in a browser: start survival, confirm the HUD shows, drifting weather visuals appear, and the forecast strip reads "No storms in 15 sols" or a storm countdown, not "Forecast uncertain".

---

## 5. Work packages

Priority: **P0** must ship, **P1** should ship, **P2** is cut first. Estimates are agent-hours.

### Lane map (file ownership)

| Lane | Packages | Owns |
|---|---|---|
| A — HUD & feedback | WP2, WP6, WP8, WP-F | `ResourceHud.js` (except the lines Lane B owns), `achievementToasts.js`, `index.html`, `advancements.js` |
| B — Economy | WP4, WP10 | `Simulation.js` economy commands, `crops.js`, `surfaceMaterials.js` yields, `balance.json`, `buildings.json`, shop price/balance strings in `ResourceHud.js`, tests |
| C — Board & world | WP1, WP7 | `layout.js`, `board.js`, `marsTerrain.js`, `state.js` grid, placement in `surfaceMaterials.js`, `drawSurfaceObjects` |
| D — Weather & sprites | WP3, WP9 | `forecastViewModel.js`, `ForecastStrip.js`, `buildingSprites.js` |
| E — Front door | WP5, WP-R | `TitleScene.js`, `MapScene.js`, `BriefScene.js`, `main.js`, `controls.js` colors |

Lanes B and C both edit `surfaceMaterials.js` and `surfaceActions.js`: B owns yields and the detail-panel text, C owns positions and `drawSurfaceObjects`. Lane B lands its first patch early so A can rebase on it.

---

### WP3 — Weather strip shows real weather · P0 · Lane D · ~1 h

**Diagnosis (reproduced).** On `UI-Overhaul`, `forecastViewModel.js` `conditionFor` marks every future day without a storm as "Forecast uncertain" because the old weather API's `basis` string always matches `/future random events are uncertain/`. Step 0 fixes that headline bug, since the archive API from `main` reports a different basis. What remains: the strip flattens everything that is not a regional/global storm or cold to "Clear".

**Do.**
- Read `day.primary` and `day.conditions` (from `src/weather/archive.js`). Map to tones and icons: Clear, Dust haze, Ice clouds, Windy, Dust devil, Ice fog, Water-ice snow, Dry-ice snow, Severe cold, and Local / Regional / Global dust storm. Add `dustLocal` to the storm IDs.
- Fix the field name: the view model reads `day.windSpeedMps`; the API provides `windSpeedMs` and `windPeakMs`.
- Readout for the selected sol: condition, temperature, wind, pressure, plus the gameplay effects `atmosphereFactor` (sun %), `habitatHeatW`, `iceDrillFactor`. The pre-merge `main` version of `ForecastStrip.js` has this exact tooltip copy; lift it (`git show origin/main:src/ui/colony/ForecastStrip.js`).
- Delete the `'uncertain'` special case in `ForecastStrip.js` `syncWeatherBar`. Keep "uncertain" only as a fallback when no archive is loaded.
- Update `test/forecast-view-model.test.js` and add cases for haze, frost and a local storm.

**Done when.** A landing in southern dust season shows varied cells; clicking a cell shows numbers; the chip counts down to the next storm; tests pass.

---

### WP2 — Achievement pop-up always visible · P0 · Lane A · ~45 min

**Diagnosis (reproduced).** `ColonyScene.create` calls `playAchievementToasts(this, pendingAwards, 78, 620)`. The signature is `(scene, queue, y, x)`, so the card renders at x 620, y 78: under the DOM control bar, with only its bottom line peeking out, and under the shop panel when that is open.

**Do.** Render colony achievements as a DOM element inside `.colony-hud-root`, with a z-index above `.colony-hud-panel`, centered just below the control bar (around y 132). Keep the queue and the chime (`scene.sound.play('achievement-chime')`). Keep the Phaser version for `ReportScene`, which has no DOM HUD.

**Reward feel (same package, cheap).** Scale-in animation, the reward amount in large type ("+70 kg"), and a line naming what just unlocked. After the card leaves, pulse the Goals tab.

**Done when.** Planting the first crop with the Base shop open shows the full card on top of everything.

---

### WP8 — Colony naming works, gated on Halfway Home · P0 · Lane A · ~45 min

**Diagnosis.** Naming and renaming both worked in a scripted run without `?demo=1`. With `?demo=1` the dialog was torn down mid-typing (gotcha 4). Before the unlock, clicking the name does nothing at all, which also reads as broken.

**Do.**
- In `ColonyScene` demo key handlers, return early when a `<dialog open>` exists or the focused element is an input.
- Move the gate from `botanist` to `halfway` in: `Simulation` `nameColony`; the `nameNode` click handler and tooltip in `ResourceHud.js`; `advancements.js` (`colony.requires`, the `botanist` and `colony` hints); the botanist line in `achievementToasts.js`; `canName` in `ColonyScene.drawDetails`; README step 3.
- When locked, clicking the name shows a message: "Colony naming unlocks at Halfway Home (sol 60)".
- When `halfway` is earned, open the name dialog automatically once. That is the reward moment.
- Use one dialog implementation: `openColonyNameDialog` in `advancementTree.js`. Delete the duplicate inline dialog in `ResourceHud.js`.
- Update `test/sim.test.js` (the block around the `nameColony` assertions expects the botanist gate).

**Done when.** Name before sol 60 is refused with a message; at sol 60 the dialog opens; renaming afterwards works, including a name containing "R" in demo mode.

---

### WP6 + WP10 — Bigger top-right buttons, visible balance · P0 · ~30 min total

- **WP6 (Lane A).** The Base / Ops / Goals tabs in the top-right are default-size buttons. Make them about 40 px tall with an icon glyph plus label, and give the active one the accent fill. Enlarge `.colony-hud-icon` in shop cards from 48 px to about 56 px with a 30 px glyph. If the control bar grows, update the fixed sizes in `position()` (`controls` height 48, `panel` top 128). Assumption: "shop icons in the top right" means these tabs; if it meant the item icons, the second change covers it.
- **WP10 (Lane B).** In `renderBase`, the footer balance is small and muted. Make it about 20 px, weight 800, `#fff`, with the unit. Do it in the same patch as the WP4 string changes, since it is the same line.

---

### WP4 — One build-materials resource, in kg · P1 · Lane B · ~2 h

**Today.** Three overlapping things: `res.credits` ("cr", start 180, earned from harvests and achievements); `res.materials {regolith, metal}` from mining rocks and scrapping the wreck, required by four buildings via `materialCost` and shown without units; and unused lander mass (`massKg`, `res.massUsed`).

**Target.** One resource, **Build materials (kg)**. Everything that used to pay credits or regolith/metal pays kg into the same pool. Every price is in kg.

**Do.**
- **Keep the state key `res.credits`** tonight and add a comment in `state.js` that it now means build materials in kg. Renaming touches about 30 call sites and a dozen test assertions for no visible gain.
- `mine`: add the mined amount to `res.credits`. `scrapRocket`: add salvage to `res.credits`. Treat one old unit as 1 kg. Raise `miningBatch` so a deposit takes a few clicks, not eight.
- Remove `materialCost` from `buildings.json` and the checks in `Simulation` `build`, `ColonyScene.drawBaseShop` and `ResourceHud.renderBase`. Fold any intended cost into the building's `cost`. Remove `res.materials` and its "In storage" line in `surfaceActions.drawSurfaceDetails`.
- Harvest keeps paying (`value_cr_per_kg` in `crops.js`). Present it as recovered inedible biomass used as feedstock, labelled a game value.
- Replace every user-facing "cr" and "credits": `ResourceHud.js` (stat label `CREDITS` → `MATERIALS`, card meta, footer, spare-part button), `achievementToasts.js`, `advancementTree.js`, `ColonyScene.js`, `controls.js` `formatUnits`, `BriefScene.js`, the harvest message in `crops.js`, the "Insufficient credits" failures in `Simulation.js`, advancement hints, README.
- Keep the opening numbers unchanged (180 start; two plots plus a washer leaves 24) so tutorial copy and `test/sim.test.js` still hold. Update tests that assert on `materials`.

**Done when.** No "cr" appears anywhere in the UI; mining a rock and scrapping the wreck raise the same number that the shop spends; tests pass.

---

### WP1 — Zoom that reveals more ground · P1 · Lane C · ~2 h

**Diagnosis (reproduced).** The grid is fixed at 16×12 (`state.js`). `colonyBoardAtZoom` only scales tile size from a fixed top-left origin. Zooming out shrinks the same 192 tiles into the corner; no tiles are added and the backdrop does not move. Range is 0.75–1.06, clamped in `ResourceHud.js`.

**Do.**
- Define a play area that the DOM does not cover: about x 12–1268, y 128–656.
- Enlarge the world grid so it fills the play area at minimum zoom. Suggested: 34×19 with zoom range 0.75–1.5 (at 0.75 a tile is 36×27 px). Move the starter base in `balance.json` `starter` to the grid centre, move the wreck anchor, and fix `checkManifest`'s hard-coded `16 * 12` and `#unpack`'s `(7, 5)` centre.
- Make `colonyBoardAtZoom(zoom, pan)` centre the view on the hab: return an origin such that the hab tile sits mid play area, then add pan. Draw only tiles that intersect the play area.
- Controls: keep the − / + buttons, add mouse wheel, add WASD / arrow-key pan (skip pan if short on time; centred zoom alone is acceptable).
- Everything on the board must use the same transform: tiles, buildings, crops (`CropLayer`), rocks and wreck (`drawSurfaceObjects`), mutation sparks (`ColonyScene` `attachMutationSparks` callback), and the terrain image from WP7.
- Fix tests that hard-code coordinates or grid size.

**Done when.** Zooming out shows more buildable tiles around the base, zooming in enlarges it, nothing is hidden behind the HUD at any zoom, and clicking a tile selects the tile under the cursor.

---

### WP7 — Ground that looks like Mars and differs per site · P1 core, P2 extras · Lane C · ~2 h

**Diagnosis (measured).** `terrain.jpg` is 864×432 px for the whole planet. `marsTerrain.js` stretches an 8 % window, about 69×39 px, to 1280×720 with no smoothing. That is why it reads as a blurry JPEG. In `surfaceMaterials.js` the wreck is always at tile (9, 5) and rocks are always in the bottom three rows; only their order varies with the seed.

**Core (P1).**
- Build the ground as a canvas texture in world-tile space (grid size × tile size), positioned and scaled by the WP1 transform.
- Base layer: the same MOLA window, drawn with `imageSmoothingEnabled = true`, as a soft colour and relief field.
- Detail layer, seeded by site latitude/longitude and mission seed: fine regolith grain, pebbles, a few small craters with rim highlights, wind ripples aligned to one direction. Crisp at every zoom. Keep the tile grid lines faint.
- Placement: seed from `hash(seed, lat, lon)`. Put the wreck 3–6 tiles from the hab at a seeded bearing. Scatter rocks across the whole grid with a clear ring around the starter base.
- Site-driven amounts from bundled NASA data: measure brightness variance of the MOLA window as a relief proxy and scale the rock count with it; scale icy-regolith patches with `site.iceFactor` (already derived from HEND). Compute the proxy in the scene and pass it into `Simulation` through options with a default, because the sim runs headless in tests.
- Credit line: "Terrain colour and rock density: game-scaled from NASA MOLA relief. Ice: NASA Mars Odyssey HEND." The shaded-relief image is not elevation; say "relief", not "elevation".

**Extras (P2, cut first).** Dust drifts that thicken after storms; frost tint on tiles when the weather reports overnight frost; a sharper elevation source (MOLA gridded elevation from the PDS) run through `scripts/prepare-mars-map.py`.

**Done when.** Two different landing sites give visibly different ground and rock layouts; the same site and seed reproduce exactly; no visible pixel blocks.

---

### WP9 — Building sprites · P1 · Lane D · ~1.5 h

**Diagnosis.** `buildingSprites.js` draws only washer, auto-harvester, ice drill, fission unit and boulder. Everything else (hab, battery, comms, recycler, air harvester, fertilizer, berm, shelter, lab) falls through to a generic box with a three-letter label in `board.js`. That fallback is what looks wrong.

**Do.** Add a drawn sprite for every remaining ID in `buildingSprites.js` on the existing 36×36 unit canvas, and add the IDs to `spriteTypes`. One visual language: dark base, light shell, teal trim, one status light (green online, red offline), soft ground shadow, no text. Silhouettes should be readable at zoom 0.75: dish on a mast for comms; stacked cells with a charge bar for battery; tank and pipe loop for recycler; intake fan for air harvester; dome with airlock for hab. Do not edit `board.js` beyond what the new IDs require (Lane C owns it).

**Done when.** All 17 buildings in `buildings.json` have a distinct sprite, online and offline, at three zoom levels.

---

### WP5 — Start and landing screens match the game · P1 · Lane E · ~1.5 h

**Today.** `TitleScene.js` is Phaser-drawn with the older palette in `controls.js` (background `#140f13`, accent `#ff805a`, square buttons). The HUD uses `#231615` panels, `#3a2623` raised, `#1b1110` sunken, `#f0886a` accent, `#c9b3a8` muted text, `#6e4b42` borders, 10 px and 6 px radii, Inter/system-ui at weights 700–800, small uppercase letter-spaced labels.

**Do.**
- Align `controls.js` colours with the HUD tokens above. This restyles every Phaser screen at once; check Map and Report afterwards.
- Title: near-empty screen. The game's own ground texture (WP7, or a dark flat fill until it lands) with a slow drift; title; one line of premise; a short vertical menu (Start survival, Choose landing site). Keyboard-first: arrow keys move a small cursor marker, Enter selects, mouse still works. That quiet, text-led, cursor-menu feel is the top-down RPG inspiration; do not copy any game's font, palette or art.
- `MapScene.js`: same tokens, rounded panels, and the forecast-strip look for the weather outlook.
- No logos.

**Done when.** Title, Map, Colony and Report read as one product in a screenshot row.

---

### WP-R — Mission design lite · P1 if the team picks option B · Lane E · ~2 h

One screen between Title and landing, reusing `BriefScene` and `checkManifest`.

- Register `BriefScene` in `src/main.js`. Flow: Title → Brief → Map → Colony → Report → "Redesign and re-fly".
- Player picks: objective (three exist in `objectives.json`; scoring exists in `rewards.js`), lander (three in `landers.json`), and one of three payload kits (for example Power, Water, Farm) that pre-place equipment through the existing `manifest` option.
- Show live bars for **mass vs lander capacity** and **cost vs mission budget**, with `checkManifest`'s reasons as the error text. Unspent budget becomes starting build materials.
- Rescue mode needs a design budget: add one value under `balance.rescue` and use it for the `checkManifest` call in the `Simulation` constructor, so landers are affordable. This is the only sim change. Lane B must review it.
- Keep "Start survival" on the title as a quick start with a default design so the fast demo path survives.

**Start only if** Step 0 and the P0 packages are green by T+2:00. Otherwise fall back to option A.

---

### WP-F — Merge fact cards · P2 · Lane A · 30 min time-box

`git merge origin/fact-cards-milestones` into integration. One conflict in `ColonyScene.js`. Its bubbles are Phaser-drawn, so check they are not hidden under DOM (gotcha 1). If it is not clean in 30 minutes, abandon it.

---

## 6. Timeline

T+0 is when Step 0 starts.

| Time | What |
|---|---|
| T+0:00–0:30 | Step 0. Team decides the Relevance option. Lanes assigned. |
| T+0:30–2:00 | P0: WP3, WP2, WP8, WP6. Lane B lands the WP4 string + balance patch first. Lane C starts WP1. |
| T+2:00 | **Checkpoint 1.** Merge what is green. Go/no-go on WP-R. |
| T+2:00–4:00 | P1: WP4 finish, WP1, WP9, WP5, WP7 core. |
| T+4:00 | **Checkpoint 2.** Merge. Cut any P1 not on track to land by T+5:30. |
| T+4:00–5:30 | Finish P1. P2 only if idle. |
| T+5:30 | **Feature freeze.** |
| T+5:30–6:30 | Full playthrough on the merged build (script below), balance pass, bug fixes only. Merge integration → `main`. Deploy. |
| T+6:30–8:00 | 30-second demo video or 7 slides; submission fields; README. |

**Cut order if behind:** WP7 extras → WP-F → WP7 core → WP5 Map restyle → WP1 pan → WP-R → WP9 (ship the worst three sprites only) → WP4.

**Demo script (use `?demo=1`).** Title → choose a site and compare ice / sun / storms → land → build two plots and a washer → +1 sol → plant → achievement card → press `1` for a dust storm, show the forecast and solar drop → clean a panel → harvest → press `F` to pass sol 60 → name the colony → report → "Redesign and re-fly".

---

## 7. Handoff protocol

- **Agents with push rights:** branch `red-harvest/<lane>-<topic>` from `red-harvest/integration`, open a PR into it. CI runs on the PR.
- **Agents without push rights** (including the Claude session that wrote this plan): commit locally and export `git format-patch red-harvest/integration --stdout > <lane>-<topic>.patch`. A teammate applies with `git am` and pushes.
- Before every handoff: `npm test`, `npm run build`, and a manual check of the changed screen at 1280×720. For UI work, attach a screenshot.
- `npm run test:browser` needs `npx playwright-core install chromium` first. Run it at each checkpoint.
- Commit message: what changed, which WP, anything touched outside the lane.
- One person owns integration and is the only one who merges.

---

## 8. Submission checklist

- [ ] Public project link (repo and deployed build) opens without login.
- [ ] Demo link: video ≤ 30 s with English subtitles, or ≤ 7 slides. Public.
- [ ] NASA Data field: MOLA, Mars Odyssey HEND, BVAD, mission soil and weather results, and how each drives gameplay.
- [ ] Partner & Other Data: LMD Mars Climate Database dust climatology (CC BY-SA 3.0), OpenMARS, Phaser, three.js, Vite. Check whether the sponsoring agencies are on the 2026 partner list.
- [ ] Use of AI: which tools wrote which code; no AI images; no NASA branding.
- [ ] Description claims only what a judge can click.
- [ ] README updated: units (kg), naming unlock, new controls.
- [ ] Re-read the 2026 submission and judging guides for anything that changed from 2025.

---

## 9. Open decisions for the team

1. Relevance: option A, B or C (section 2). Needed in the first 30 minutes.
2. Is "shop icons in the top right" the Base / Ops / Goals tabs (assumed) or the item icons?
3. Is the "kg feature that does not work" the mined regolith/metal (assumed) or the lander mass budget?
4. Who owns integration and applies patches?
5. Does the 8 hours include the demo video and submission form? This plan assumes yes and reserves the last 90 minutes for them.
