# Red Harvest — Design doc: notifications, fonts, top bar, comms-dish seed orders

Written 2026-11-15 for agents continuing from branch **`General-Overhaul`** (`13bfbdc` = the integration branch + the new radish model and seed icon). Branch from it. Ground rules from `docs/MASTER_PLAN.md` section 1 still apply (tests and build green, small commits, label game values, art drawn in code, no pushes without the owner).

Four work packages.

> **Decisions (Mark, 2026-11-15 08:55):**
> - Top bar: **Option A, one strip** — approved, build it.
> - Fonts: **pair A, Amatic SC (display) + Patrick Hand (body/numbers).**
> - Repair costs **120 kg once**. Orders are free. Seeds you have received are yours for good (replant from harvest), so **a crop already delivered or in the starter set cannot be ordered again**.
> - A supply drop **lands as a crate on the map**; the player clicks it to collect. Seeds unlock on collection, not on landing.

---

## 0. Shared contracts (read first; this is what keeps the lanes cohesive)

Every lane codes against these. Land this section's stubs in the **first commit** (Lane 1 owns it) so the others can build on real names.

**State** (`src/sim/state.js`):

```js
comms: { repaired: false, order: null, delivered: [], crate: null }
// order: { items: [cropId, ...], massKg, placedSol, arrivalSol }
// crate: { x, y, items: [cropId, ...], landedSol }   (on the board until collected)
```

**Commands** (`Simulation.command`): `repairComms` · `orderSeeds { items: [cropId, ...] }` · `collectCrate` (all return `{ ok, reason }` like every other command).

**Events** (`sim.on`): `comms:repaired` · `supply:ordered` (order) · `supply:landed` (crate, fires on the arrival sol) · `supply:seeds` (existing name; fires on **collection** with `{ sol, crops }`, crops = display names).

**Board rules for the crate:** the sim places it on an empty tile 2–5 tiles from the hab (seeded; never on a building, rock or the wreck). Building on that tile is refused until it is collected. `surfaceFeatureAt(state, cell)` returns the crate, so selecting its tile opens the crate's detail.

**Read helpers** (`Simulation`): `seedCatalog()` → `[{ id, name, packetKg, owned, orderable }]` · `commsStatus()` → `{ repaired, repairCost, order, solsRemaining, capacityKg }`.

**Data** (`public/data/balance.json`, under `rescue.comms`): `repairCost`, `orderCapacityKg`, `deliverySols`, `starterSeeds`, `packetKg{}`. UI and model code never hard-code these numbers.

**Design tokens** (one new file, `src/ui/theme.js`, imported by `ResourceHud.js`, `ForecastStrip.js`, `achievementToasts.js`, `controls.js`): `fontDisplay`, `fontBody`, plus the existing colours (`PANEL_BG #231615`, `RAISED #3a2623`, `SUNKEN #1b1110`, `ACCENT #f0886a`, `MUTED #c9b3a8`, border `#6e4b42`, amber `#ffb05a`, mint `#9bd8ae`). No lane defines its own colours or font stacks.

**Layout numbers** (`src/ui/colony/layout.js`): play area and HUD heights already live here. Anything that moves the HUD updates these constants, not local copies.

### Lanes and order

| Lane | Packages | Owns |
|---|---|---|
| 1 — Sim | WP-C rules, crate placement, goals, tests | `Simulation.js`, `advancements.js`, `selectors.js` (goal progress + `trend` fields for WP-T), new `src/sim/systems/supply.js`, sim tests |
| 2 — Look | WP-F fonts + WP-T top bar | `src/ui/theme.js` (new), `ResourceHud.js` (CSS, stats/controls bar, `position()`), `layout.js`, `controls.js` text/font, `BootScene.js` font loading, `src/main.js` font imports, `scripts/check-mission-browser.mjs` selectors, README credits |
| 3 — Panels | WP-N messages + WP-C comms panel and crate panel | new `src/ui/colony/messages.js`, new `src/ui/colony/CommsPanel.js`, `achievementToasts.js`, `surfaceActions.js` crate detail, `ColonyScene.js` selection hooks; only small mount hooks in `ResourceHud.js` |
| 4 — 3D | WP-C dish + crate models, render layer | `src/assets/buildings/*` (new), `CropLayer.js`, `board.js` (comms branch), `buildingSprites.js` (drop comms 2D), `surfaceActions.js` `drawSurfaceObjects` (crate) |

All four start at once against the contracts above (the stubs are already committed: `state.comms`, `balance.rescue.comms`). Lane 3 keeps its `ResourceHud.js` edits to mount points (e.g. `hud.openComms()`, replacing the toast block with a call into `messages.js`) because Lane 2 rewrites the top of that file. `src/ui/theme.js` (tokens + font stacks) is already in the base commit; Lane 2 installs the font packages and may refine values but must keep the export names. One integrator merges in order 1 → 4 → 3 → 2, runs `npm test`, `npm run build`, `CHROME_PATH=… npm run test:browser`, and plays the demo script.

---

## WP-N — Messages auto-dismiss, with a countdown bar, sitting on the weather bar · Lane 3 · ~1 h

**Today.** `.colony-hud-toast` in `ResourceHud.js` is fixed at `left:24px; top:566px`, never times out, and is closed only with ×. A one-line message floats ~60 px above the weather bar; a three-line one runs into it.

**Do.**
- Anchor by the **bottom**: `bottom` = (720 − forecast strip top) + 6 px, read from `layout.js`, so the box always sits 6 px above the weather bar and grows upward.
- Auto-dismiss: 4 s + 45 ms per character, clamped to 4–9 s. Warnings (power shortage, crop died, equipment outage) get 9 s and the amber border.
- A 4 px bar along the bottom edge of the box **fills left to right** over that time; the box fades out when it is full. Use one CSS animation (`transform: scaleX`), not a JS timer per frame.
- Hover or keyboard focus pauses the bar. × still closes immediately. A new message replaces the current one and restarts the bar. Respect `prefers-reduced-motion` (no animation; still dismiss on time).
- While the weather detail card is open it may cover the message; that is fine (it already has the higher z-index).
- Achievement cards keep their own timing but adopt the same bar, so the two feel like one system.

**Done when.** A message appears flush above the weather bar, the bar fills, and it disappears without a click; hovering holds it; `test:browser` still passes.

---

## WP-F — Fonts · Lane 2 · ~1.5 h

**Research summary.**
- Games separate roles: a characterful **display** face for titles, labels and big moments, and a plain, legible **body** face for numbers and dense text. Decorative faces fail on small text and on numbers, where players need to tell 1/7 and 0/8 apart at a glance and values must not jitter as they change.
- Don't Starve's in-game face is Belisa Plumilla Manual: thin, condensed, uneven pen strokes. Its licence was not verified, so do not ship it. Use open-licensed lookalikes.
- Test at the smallest size on the real background, in the game, not in a mockup.

**Candidates** (all on npm as `@fontsource/*`, SIL OFL; see `fonts.png`):

| | Display | Body / numbers | Read |
|---|---|---|---|
| **A (recommended)** | Amatic SC 700 | Patrick Hand | Closest to the thin hand-inked look. Amatic is too thin below ~20 px. |
| B | Londrina Solid | Barlow Semi Condensed | Safest legibility; hand-cut rather than hand-inked. |
| C | Caveat Brush | Kalam | Warm, but italic numbers are slow to read ("11" looks like "II"). |
| D | Mansalva | Neucha | Most character; headings get noisy. |

**Do.**
- Add the two chosen packages; import their CSS in `src/main.js` (bundled by Vite, no CDN). Put the stacks in `theme.js` with system fallbacks.
- Rules: display face only for titles, tab labels, stat labels and achievement names, **never under 20 px**, with letter-spacing ~0.06em. Everything else, and **all numbers**, in the body face at 15 px or larger. Give changing numbers a fixed-width box (Patrick Hand has no tabular figures).
- Phaser text: `controls.js` `text()` takes the same stacks. Wait for `document.fonts.load()` for both faces in `BootScene` before starting `Title`, or Phaser measures with the fallback.
- Add the fonts and licences to README credits.

**Done when.** Title, Map, Colony, panels, toasts and Report all use the pair; no text is clipped at 1280×720; numbers stay readable on the terrain.

---

## WP-T — Top bar · Lane 2 · ~2 h · **APPROVED: Option A**

**Problems today.** Two stacked full-width bars take 121 px (17 % of the height). Stats are text with no icons, no trend, and no hint of what is urgent. "Colony zoom" and "Terrain · NASA MOLA relief" are labels, not information. Speed controls and panel tabs share a row with the colony name.

**What other games do.** Colony sims keep vitals in one thin strip or a transparent corner list, with icons and per-day rates, and keep time controls beside the clock. Survival games use a day dial and round meters with icons, few numbers. Common lessons: one glance for "am I OK", urgency by colour, and nothing on screen that is not a decision input.

**Options** (see `topbar.png`):

- **A — One strip (recommended).** 56 px. Left: sol dial (ring fills as the sol passes) with colony name and "Rescue in N sols · season". Middle: five icon chips, each with value, unit and a second line for the trend ("−4 / sol", "surplus 2.4", "runs out sol 11"); a chip turns amber when it needs attention. Right: speed buttons, then Base / Ops / Goals. Zoom moves to a small control at the bottom-right of the map; the terrain credit stays in the footer. Frees ~65 px of map.
- **B — Floating gauges.** No bar. A large day dial top-left, round fill meters for each resource, tabs top-right. Most atmospheric; least precise, and the meters need a defined "full" for water, power and materials.

**If A is approved.** Rebuild the stats and controls into one flex row in `ResourceHud.js`; add `trend` fields to `selectors.js` (water and food rates already exist in sim state; materials trend = last-sol delta); update `layout.js` (HUD bottom ≈ 70, play area top ≈ 72) so the board, terrain credit and panel positions follow; clicking the colony name keeps the naming behaviour; update `scripts/check-mission-browser.mjs` if selectors move.

---

## WP-C — Comms dish: repair it, order seeds, collect the crate · Lanes 1, 3, 4 · ~4 h total

**Player story.** You crash with a wrecked comms dish and two kinds of seed. Fixing the dish is expensive enough to make you ask whether you need it. If you do, you can radio one seed order at a time; the drop lands 20 sols later, and a countdown runs in the dish's panel the whole time.

### Rules (all numbers are game values, in `balance.json`; tune after a playthrough)

| Rule | Value | Why |
|---|---|---|
| Starter seeds | radish, lettuce | Same as today's first tier. |
| Dish at landing | broken: no power draw, no research downlink | Gives the repair two payoffs: seeds and science. |
| Repair cost | **120 kg** build materials, dish must then be powered (400 W) | You start with 180 and have 24 left after two plots and a washer. 120 is about three plots' worth, or the first three harvests plus an achievement: a real "do I need this?". |
| Order capacity | **0.5 kg** of seed per drop | Forces a choice; see packet table. |
| Delivery | **20 sols** after the order; one order in flight at a time | With rescue at sol 120, at most ~4–5 orders. |
| Order needs | dish repaired **and online** when sending; transit is not interrupted by storms | Simple and readable. |
| Arrival | a crate lands on a tile near the base on the arrival sol; **collecting it** unlocks the crops permanently; planting still costs 0.2 kg food as today | No new inventory system. |
| Reordering | starter crops and crops already delivered, or in flight, are not orderable | You replant from your own harvest. |

**Packet mass** — the "determine it somehow" part. Small seeds are light; grains and beans are heavier; tubers are planted as pieces and are heaviest. Suggested: lettuce 0.02, radish 0.03, tomato 0.02, soybean 0.12, wheat 0.15, sweet potato 0.20, potato 0.30 kg. So 0.5 kg buys potato + wheat, or soybean + sweet potato + tomato, never everything. These follow the real ordering of seed sizes but are **not** sourced figures; label them game values.

### Lane 1 — Sim
- Remove the five crops from the `rewards` map in `advancements.js` (they are currently locked behind **Second Harvest**) and remove the automatic `seedDropIntervalSols` / `seedDropTiers` drops in `Simulation.step` and `unlockRequirement`. Fertilizer Maker and Auto-Harvester stay on Second Harvest.
- `unlockRequirement(crop)`: if not in `starterSeeds` and not in `state.comms.delivered` → `'a seed order from the Comms Dish'`.
- `repairComms`: checks materials, spends, sets `repaired`, emits. Until repaired the starter dish is `online: false`, contributes 0 to `state.power.comms`, and is skipped by `powerSystem`.
- `orderSeeds`: validates repaired + online, no order in flight, every item orderable, total mass ≤ capacity; stores the order with `arrivalSol = sol + deliverySols`.
- `step()`: on `arrivalSol`, clear `order`, place `state.comms.crate` on a seeded empty tile 2–5 tiles from the hab, emit `supply:landed`.
- `collectCrate`: move crate items to `delivered`, clear `crate`, emit `supply:seeds` with crop names, earn **Special Delivery**, record a decision. `build` refuses the crate's tile.
- Goals: add **"Phone Home"** (repair the dish) and **"Special Delivery"** (first drop arrives); `downlink` now requires Phone Home. Fix hints that mention seed supply drops.
- Tests: locked before repair; repair cost and refusal; over-capacity refused; second order refused while one is in flight; arrival on the exact sol; crops plantable after; non-rescue mode unaffected. Update tests that relied on timed seed drops.

### Lane 3 — Comms panel (DOM, new `CommsPanel.js`)
- Selecting the dish opens a HUD panel, not the old Phaser detail box.
- **Broken:** short explanation, what repair unlocks, cost, a Repair button (disabled with the shortfall shown).
- **Repaired, idle:** seed catalogue as cards (reuse the shop card and the new seed icons), each with packet mass and an add/remove toggle; a mass meter "0.32 / 0.50 kg" that turns amber when full; **Send order**.
- **Order in flight:** a ring countdown "Supply drop in 14 sols", the order contents, and the arrival sol.
- **Crate on the ground:** "Supply crate landed — collect it" with a button that pans the camera to it (if Lane 2's board exposes a pan helper; otherwise just highlights). The crate tile's own detail (via `surfaceFeatureAt`) shows its contents and a **Collect** button.
- **All seeds owned:** "Every seed is in your vault. Replant from your harvests." (no order UI). Mirror a one-line countdown in Ops under Active operations. The ring updates on every `sol` event.
- Seeds tab in the Base shop: locked cards read "Order from the Comms Dish" and open the dish panel when clicked.
- Messages (through WP-N): order sent, drop arrived with crop names.

### Lane 4 — three.js dish and crate (`src/assets/buildings/`)
- Follow `src/assets/crops/radish.js` and `primitives.js`: build from primitives with vertex colours, export `createCommsDish()` returning a `THREE.Group` with two child groups, `broken` and `repaired`, plus `setState(group, { repaired, online, ordering })`.
- **Broken:** dish tilted and half-buried, one reflector panel missing, feed arm snapped and hanging, scorch marks, loose cable, no light.
- **Repaired:** upright on its mast, reflector whole, feed arm set, a green status LED; the dish slowly tracks (small yaw sway). **Order in flight:** LED pulses amber and a faint ring animates on the feed. Offline: LED red, no motion.
- Rendering: generalise `CropLayer` so it accepts non-crop items (`{ key, model: 'commsDish', x, y, size, state }`); `board.js` sends the dish through it and stops calling the 2D `comms` sprite. It must follow the board zoom/pan transform like crops do, and be disposed with the layer.
- Swap from broken to repaired on `comms:repaired` with a short scale-and-dust pop, then show the achievement.
- **Supply crate** (`src/assets/buildings/supplyCrate.js`): a small parachute-dropped cargo crate (ribbed box, straps, a crumpled chute beside it, a blinking beacon). Shown on `state.comms.crate`'s tile through the same layer; a short drop-in animation on `supply:landed`; removed on collect.
- Keep it light: under ~1,500 triangles each, no textures, no new image files.

**Done when (whole package).** New game: dish looks wrecked, Seeds tab shows two crops. Repair costs 120 kg and the model changes. An order of ≤ 0.5 kg starts a 20-sol countdown visible in the dish panel and Ops. On the arrival sol the crops unlock and a message appears. All tests and `test:browser` pass.

---

## Open questions

None; see Decisions at the top.
