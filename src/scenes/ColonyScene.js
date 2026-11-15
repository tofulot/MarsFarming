// AI-assisted (OpenAI Codex)
import Phaser from 'phaser';
import { ColonyPresentation } from '../ui/colony/ColonyPresentation.js';
import { drawColonyBoard } from '../ui/colony/board.js';
import { shopCategories } from '../ui/colony/catalog.js';
import { playAchievementToasts } from '../ui/achievementToasts.js';
import { drawSurfaceDetails, drawSurfaceObjects, formatMaterials, surfaceFeatureAt } from '../ui/surfaceActions.js';
import { drawAdvancementTree, openColonyNameDialog } from '../ui/advancementTree.js';
import { advancements, nextAdvancement } from '../sim/advancements.js';
import { Simulation } from '../sim/Simulation.js';
import { siteRelief } from '../rendering/marsTerrain.js';
import { cropSolsRemaining } from '../sim/systems/crops.js';
import { soilStatusLine } from '../sim/systems/soil.js';
import { lineagePhenotype } from '../sim/systems/mutations.js';
import { irrigationMakeup, waterOutput } from '../sim/systems/water.js';
import { attachMutationSparks, drawGeneticsChips } from '../ui/colony/genetics.js';
import { boardTransform, boardZoomRange, panBoard, stepBoardZoom } from '../ui/colony/layout.js';
import { button, colors, panel, progressBar, targetBackground, text } from '../ui/controls.js';

const washerMessages = {
  queued: '1 sol remaining · Requires power and water',
  power: 'Waiting for power · 1 sol once powered',
  water: 'Waiting for water · 1 sol once supplied',
  complete: 'Batch complete · Soil is ready to plant',
};

const detailPanelLayouts = Object.freeze({
  default: { x: 800, y: 188, width: 460, height: 410 },
  achievements: { x: 310, y: 158, width: 646, height: 438 },
});

export class ColonyScene extends Phaser.Scene {
  constructor() { super('Colony'); }

  create(options) {
    targetBackground(this);
    this.options = options;
    this.dataSet = this.registry.get('missionData');
    // Relief proxy from the NASA MOLA shaded-relief window scales deposit count (sim default when absent).
    const landing = options.site ?? this.dataSet.sites.find(({ id }) => id === (options.siteId ?? this.dataSet.sites[0].id));
    this.surfaceRelief = landing && siteRelief(this.textures.get('mars-terrain')?.getSourceImage(), landing.lat, landing.lon);
    this.sim = new Simulation(this.dataSet, this.surfaceRelief === undefined ? options : { ...options, relief: this.surfaceRelief });
    this.sim.command({ type: 'setSpeed', speed: 0 });
    this.acc = 0;
    this.boardZoom = boardZoomRange.initial;
    this.boardPan = { x: 0, y: 0 };
    this.selected = null;
    this.shopCategory = shopCategories[0];
    this.timerPage = 0;
    this.showTimers = false;
    this.showAdvancements = false;
    this.showShopDetails = true;
    this.activePanel = 'base';
    this.seedTool = null;
    this.achievementSelection = null;
    this.tool = null;
    this.breedMotherUid = null;
    const { rescue } = this.sim.state;
    this.message = rescue
      ? `Rescue in ${rescue.arrivalSol} sols. You have ${this.dataSet.balance.rescue.rationSols} sols of rations. Start with two Greenhouse Plots and a Soil Washer.`
      : 'Use the base shop to equip the outpost. Press 1× to advance time.';
    this.finished = false;
    this.events.once('shutdown', () => {
      this.nameDialog?.remove();
      this.scene.stop('UI');
    });
    const pendingAwards = advancements.filter(({ id }) => rescue && Object.hasOwn(rescue.earned, id))
      .map((award) => ({ ...award, sol: rescue.earned[award.id] }));
    const announceAward = playAchievementToasts(this, pendingAwards, 78, 620);
    this.sim.on('advancement', (award) => announceAward({ ...award, sol: rescue.earned[award.id] }));
    this.sim.on('sol', () => { this.refreshGrid(); this.drawSide(); });
    this.sim.on('event:start', (event) => this.notify(`${event.name} · ${event.until - event.startedSol} sols. ${event.fact ?? ''}`));
    this.sim.on('wash:complete', ({ plots }) => this.notify(`Soil treatment complete. ${plots} ${plots === 1 ? 'plot is' : 'plots are'} ready to plant.`));
    this.sim.on('supply:seeds', ({ crops: names }) => {
      this.notify(`Supply drop arrived · New seeds: ${names.join(', ')}.`);
      this.drawSide();
    });
    this.sim.on('power:shortage', () => {
      if (!this.sim.state.events.active.length) this.notify('Power shortage. Add solar arrays or preserve battery charge.');
    });
    this.sim.on('crop:died', ({ name }) => this.notify(`${name} died after going without power, water or treated soil.`));
    this.sim.on('mutation:alleleFlip', ({ name, flips, solarBoosted }) => {
      const loci = flips.map((flip) => `${flip.locus} ${flip.from}→${flip.to}`).join(', ');
      this.notify(solarBoosted
        ? `Solar flare mutation in ${name}: ${loci}`
        : `Allele flip in ${name}: ${loci}`);
    });
    attachMutationSparks(this, this.sim, (plotUid) => {
      const plot = this.sim.state.buildings.find(({ uid }) => uid === plotUid);
      if (!plot) return null;
      const { x: left, y: top, tile, row } = boardTransform(this);
      return { x: left + plot.x * tile + tile / 2, y: top + plot.y * row + row / 2 };
    });
    this.sim.on('mission:end', (state) => {
      this.finished = true;
      this.scene.start('Report', { state, options, pendingAwards: pendingAwards.slice() });
    });
    this.presentation = new ColonyPresentation(this);
    this.tileLayer = this.add.group();
    this.sideLayer = this.add.group();
    this.refreshGrid();
    this.drawSide();
    this.scene.launch('UI', { sim: this.sim, foodPerCrew: this.dataSet.balance.foodPerCrew });
    this.bindBoardKeys();
    if (options.demo) {
      this.input.keyboard.on('keydown-ONE', () => this.run({ type: 'triggerEvent', id: 'dustRegional' }, false));
      this.input.keyboard.on('keydown-TWO', () => this.run({ type: 'triggerEvent', id: 'spe' }, false));
      this.input.keyboard.on('keydown-F', () => { for (let i = 0; i < 30 && !this.finished; i++) this.sim.step(); });
      this.input.keyboard.on('keydown-CLOSED_BRACKET', () => this.run({ type: 'setSpeed', speed: 4 }, false));
      this.input.keyboard.on('keydown-R', () => this.run({ type: 'endMission' }, false));
    }
  }

  update(time, delta) {
    if (!this.sim || this.finished) return;
    const { speed } = this.sim.state;
    const tick = this.dataSet.balance.solMs;
    this.acc += Math.min(delta, tick) * speed;
    while (this.acc >= tick && !this.finished && this.sim.state.speed) {
      this.acc -= tick;
      this.sim.step();
    }
    this.panWithKeys(delta);
    const progress = Math.min(1, this.acc / tick);
    this.presentation?.update(time, progress);
    if (this.runningWasherBar) this.runningWasherBar.scaleX = this.acc / tick;
  }

  /** WASD / arrow keys pan the board; + / - zoom. Ignored while typing or while a dialog is open. */
  bindBoardKeys() {
    const keys = { w: [0, -1], arrowup: [0, -1], s: [0, 1], arrowdown: [0, 1],
      a: [-1, 0], arrowleft: [-1, 0], d: [1, 0], arrowright: [1, 0] };
    this.panKeys = new Set();
    const typing = (event) => event.ctrlKey || event.metaKey || event.altKey
      || document.querySelector('dialog[open]')
      || event.target?.closest?.('input, textarea, select, [contenteditable="true"]');
    const down = (event) => {
      const key = event.key.toLowerCase();
      if (typing(event) || this.finished) return;
      if (keys[key]) {
        this.panKeys.add(key);
        if (key.startsWith('arrow')) event.preventDefault();
      } else if (key === '=' || key === '+' || key === '-' || key === '_') {
        stepBoardZoom(this, key === '-' || key === '_' ? -1 : 1);
        this.refreshGrid();
        this.hud?.refresh();
      }
    };
    const up = (event) => this.panKeys.delete(event.key.toLowerCase());
    const clear = () => this.panKeys.clear();
    this.panVector = (key) => keys[key];
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', clear);
    this.events.once('shutdown', () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', clear);
    });
  }

  panWithKeys(delta) {
    if (!this.panKeys?.size) return;
    let dx = 0, dy = 0;
    for (const key of this.panKeys) {
      const [x, y] = this.panVector(key);
      dx += x;
      dy += y;
    }
    if (!dx && !dy) return;
    const speed = 12 / (this.boardZoom ?? 1) * Math.min(delta, 100) / 1000;
    panBoard(this, dx * speed, dy * speed);
    this.refreshGrid();
  }

  notify(copy) {
    this.message = copy;
    this.feedback?.setText(copy);
    this.hud?.refresh();
  }

  run(command, showResult = true) {
    const result = this.sim.command(command);
    if (this.finished) return result;
    if (showResult || !result.ok) this.notify(result.reason);
    this.refreshGrid();
    this.drawSide();
    return result;
  }

  select(x, y) {
    this.activePanel = 'base';
    this.showTimers = false;
    this.showAdvancements = false;
    this.selected = { x, y };
    this.showShopDetails = false;
    if (surfaceFeatureAt(this.sim.state, this.selected)) {
      this.seedTool = null;
      this.tool = null;
      this.refreshGrid();
      this.drawSide();
      return;
    }
    if (this.seedTool) {
      const unit = this.sim.state.buildings.find(item => item.x === x && item.y === y);
      if (unit) {
        const result = this.run({ type: 'plant', id: this.seedTool, uid: unit.uid });
        if (result.ok) this.seedTool = null;
        return;
      }
    }
    if (this.tool && !this.sim.state.buildings.some((unit) => unit.x === x && unit.y === y)) {
      this.placeStructure(this.tool, this.selected);
      return;
    }
    this.refreshGrid();
    this.drawSide();
  }

  placeStructure(id, cell) {
    this.tool = null;
    this.run({ type: 'build', id, ...cell });
  }

  refreshGrid() {
    drawColonyBoard(this);
    drawSurfaceObjects(this);
  }

  drawSide() {
    this.presentation?.refresh();
    this.drawDetails();
    this.presentation?.finishDetails();
  }

  drawDetails() {
    this.runningWasherBar = null;
    this.sideLayer.clear(true, true);
    const add = (item) => this.sideLayer.add(item);
    const say = (x, y, copy, size, options = {}) => add(text(this, mapX(x), mapY(y), copy, size, {
      ...options,
      ...(options.wordWrap ? { wordWrap: { ...options.wordWrap, width: options.wordWrap.width * scaleX } } : {}),
    }));
    const action = (...args) => {
      const [x, y, width, height, ...rest] = args;
      const { box, copy } = button(this, mapX(x), mapY(y), width * scaleX, height * scaleY, ...rest);
      add(box);
      add(copy);
    };
    const bar = (x, y, width, height, fraction, color) =>
      progressBar(this, this.sideLayer, mapX(x), mapY(y), width * scaleX, height * scaleY, fraction, color);
    const state = this.sim.state;
    const layout = this.showAdvancements ? detailPanelLayouts.achievements : detailPanelLayouts.default;
    this.detailsLayout = layout;
    const scaleX = layout.width / 550;
    const scaleY = layout.height / 449;
    const mapX = (x) => layout.x + (x - 675) * scaleX;
    const mapY = (y) => layout.y + (y - 154) * scaleY;
    const cell = this.selected;
    const feature = surfaceFeatureAt(state, cell);
    const unit = cell && state.buildings.find((entry) => entry.x === cell.x && entry.y === cell.y);
    if (this.hud && !feature && !unit) {
      this.hud.renderPanel();
      return;
    }
    this.hud?.renderPanel();
    if (feature) {
      drawSurfaceDetails(this, feature);
      return;
    }
    const info = unit && this.dataSet.buildings.find(({ id }) => id === unit.id);
    const crop = unit && state.crops.find(({ plotUid }) => plotUid === unit.uid);
    if (!unit && !this.showTimers && !this.showAdvancements && !this.showShopDetails) return;
    add(panel(this, layout.x, layout.y, layout.width, layout.height, 0x3b231f).setInteractive());
    const title = this.showAdvancements ? 'Achievement tree' : this.showTimers ? 'Operations' : info?.name ?? 'Base shop';
    say(695, 169, title, 24, { fontStyle: 'bold' });
    if (this.showAdvancements) {
      const selected = this.achievementSelection ?? nextAdvancement(state.rescue)?.id ?? 'rescue';
      drawAdvancementTree(this, this.sideLayer, state.rescue, selected, (id) => {
        this.achievementSelection = id;
        this.drawSide();
      }, { x: mapX(695), y: mapY(208), scaleX, scaleY });
      const canName = Object.hasOwn(state.rescue.earned, 'botanist');
      action(695, 548, 272, 36, canName ? (state.rescue.colonyName ? 'Rename colony' : 'Name colony') : 'Colony naming unlocks with Botanist', canName ? () => {
        this.run({ type: 'setSpeed', speed: 0 }, false);
        this.nameDialog = openColonyNameDialog(state.rescue.colonyName, (name) => {
          this.achievementSelection = null;
          const result = this.run({ type: 'nameColony', name });
          if (result.ok) this.hud?.refresh();
          return result;
        });
      } : null, { size: 14 });
    } else if (this.showTimers) {
      const timers = state.events.active.map((event) => {
        const total = event.until - event.startedSol;
        const remaining = event.until - state.sol;
        const target = state.buildings.find(({ uid }) => uid === event.targetUid);
        const name = target ? this.dataSet.buildings.find(({ id }) => id === target.id).name : '';
        return {
          label: name ? `${event.name} · ${name}` : event.name,
          status: `${remaining} / ${total} sols remaining`,
          fraction: 1 - remaining / total,
        };
      });
      const packet = state.metrics.packets[0];
      if (packet) {
        const remaining = state.power.comms ? `~${Math.ceil(state.res.data / state.power.comms)} sols` : 'Waiting for powered comms';
        timers.push({ label: 'Research downlink · Current batch', status: `${state.res.data} packets queued · ${remaining}`,
          fraction: 1 - packet.amount / (packet.total ?? packet.amount) });
      }
      const pageSize = 4;
      const pages = Math.max(1, Math.ceil(timers.length / pageSize));
      this.timerPage = Math.min(this.timerPage, pages - 1);
      if (!timers.length) say(695, 234, 'Weather, outages and research downlinks appear here.', 16, { color: colors.muted });
      timers.slice(this.timerPage * pageSize, (this.timerPage + 1) * pageSize).forEach((timer, i) => {
        const y = 224 + i * 72;
        say(695, y, timer.label, 16, { fontStyle: 'bold' });
        say(695, y + 22, timer.status, 14, { color: colors.muted });
        bar(695, y + 44, 496, 6, timer.fraction);
      });
      if (pages > 1) {
        action(695, 493, 52, 35, '←', this.timerPage > 0 ? () => { this.timerPage--; this.drawSide(); } : null);
        say(762, 501, `${this.timerPage + 1}/${pages}`, 15);
        action(811, 493, 52, 35, '→', this.timerPage < pages - 1 ? () => { this.timerPage++; this.drawSide(); } : null);
      }
      const { res, power } = state;
      add(this.add.rectangle(mapX(695), mapY(536), 513 * scaleX, 1, colors.line).setOrigin(0));
      const spares = this.dataSet.balance.kit.find(({ id }) => id === 'spares');
      const sparePrice = this.sim.purchasePrice(spares);
      const waterFirst = power.priority[0] === 'iceDrill';
      action(695, 546, 244, 34, `Buy spare part · ${sparePrice} cr`,
        res.credits >= sparePrice ? () => this.run({ type: 'buySpares' }) : null, { size: 14 });
      say(695, 583, `${res.spares} in storage`, 13, { color: colors.muted });
      action(949, 546, 259, 34, `Power order · ${waterFirst ? 'Water first' : 'Farm first'}`,
        () => this.run({ type: 'setPriority', priority: waterFirst
          ? ['plot', 'hydroponic', 'iceDrill'] : ['iceDrill', 'recycler', 'plot', 'hydroponic'] }), { size: 14 });
    } else if (info) {
      const irrigation = state.rescue && info.plot
        ? irrigationMakeup(-info.waterLPerSol, this.dataSet.balance, state.rescue) : null;
      const description = irrigation == null ? info.why
        : `${info.why}\nCondensate recovery keeps tank use to ${Number(irrigation.toFixed(1))} L per planted sol.`;
      say(695, 207, description, 14, { color: colors.muted, wordWrap: { width: 495 } });
      say(695, 245, unit.online ? 'ONLINE' : 'OFFLINE / POWER SHED', 13,
        { color: unit.online ? '#9bd8ae' : '#ff805a' });
      const doForUnit = (type, id) => this.run({ type, id, uid: unit.uid });
      if (unit.soil) {
        say(695, 266, soilStatusLine(unit, this.dataSet), 12,
          { color: colors.muted, wordWrap: { width: 500 } });
      }
      if (this.breedMotherUid != null && !state.crops.some(({ uid }) => uid === this.breedMotherUid)) {
        this.breedMotherUid = null;
      }
      if (crop) {
        const traits = this.sim.cropTraits(crop.cropId);
        const lineage = state.lineages[crop.lineageId];
        const pheno = lineagePhenotype(state, crop, this.dataSet.mutations);
        const gen = lineage?.generation ? `  ·  gen ${lineage.generation}` : '';
        const genetics = this.sim.cropGenetics(crop);
        say(695, 291, `${traits.name}  ·  ${Math.round(crop.growth * 100)}% grown  ·  ${Math.round(crop.health * 100)}% health${gen}`, 18);
        const remaining = cropSolsRemaining(traits, unit, this.dataSet.balance, crop.growth, pheno.growth);
        const status = !remaining ? 'Ready to harvest' : `${remaining} growing sols remaining`;
        say(695, 318, status, 14, { color: colors.muted, wordWrap: { width: 500 } });
        const geneticsBottom = genetics.length
          ? 154 + (drawGeneticsChips(this, this.sideLayer, genetics, {
            x: mapX(695), y: mapY(338), maxWidth: 500 * scaleX,
          }) - layout.y) / scaleY
          : 338;
        bar(695, geneticsBottom + 10, 496, 8, crop.growth, remaining ? colors.accent : colors.mint);
        if (remaining) say(695, geneticsBottom + 22, !unit.online ? 'Growth stalled last sol · No power' :
          unit.watered ? 'Water supplied last sol' :
            state.sol === crop.plantedSol ? 'Growth begins next sol' : 'Growth stalled last sol · No water',
        13, { color: colors.muted });
        const mature = crop.growth === 1;
        const actionY = remaining ? geneticsBottom + 50 : geneticsBottom + 32;
        action(695, actionY, 180, 38, 'Harvest', mature ? () => doForUnit('harvest') : null);
        if (this.breedMotherUid == null) {
          action(890, actionY, 150, 38, 'Set mother', mature ? () => {
            this.breedMotherUid = crop.uid;
            this.notify(`Mother set: ${traits.name}. Select a mature father of the same crop, or self-cross.`);
            this.drawSide();
          } : null);
          action(1055, actionY, 140, 38, 'Replant', mature ? () => {
            if (doForUnit('harvest').ok) doForUnit('plant', traits.id);
          } : null);
        } else if (this.breedMotherUid === crop.uid) {
          action(890, actionY, 140, 38, 'Self-cross', mature ? () => {
            this.breedMotherUid = null;
            this.run({ type: 'cross', motherUid: crop.uid, fatherUid: crop.uid });
          } : null);
          action(1045, actionY, 140, 38, 'Cancel', () => {
            this.breedMotherUid = null;
            this.notify('Breeding cancelled.');
            this.drawSide();
          });
        } else {
          const mother = state.crops.find(({ uid }) => uid === this.breedMotherUid);
          const canCross = mature && mother && mother.cropId === crop.cropId;
          action(890, actionY, 140, 38, 'Cross here', canCross ? () => {
            this.breedMotherUid = null;
            this.run({ type: 'cross', motherUid: mother.uid, fatherUid: crop.uid });
          } : null);
          action(1045, actionY, 140, 38, 'Cancel', () => {
            this.breedMotherUid = null;
            this.notify('Breeding cancelled.');
            this.drawSide();
          });
        }
      } else if (info.plot) {
        say(695, 318, unit.treated ? 'Choose a crop' : 'A powered Soil Washer will treat this plot automatically.', 16);
        const vaulted = Object.entries(state.seedVault ?? {});
        if (unit.treated && vaulted.length) {
          say(695, 338, `Seed vault: ${vaulted.map(([cropId]) => cropId).join(', ')} ★`, 13, { color: colors.muted });
        }
        this.dataSet.crops.slice(0, 8).forEach(({ id }, i) => {
          const item = this.sim.cropTraits(id);
          const requirement = this.sim.unlockRequirement(item);
          const foodCost = this.sim.plantingFoodCost(id);
          const affordable = state.res.foodKg + 1e-9 >= foodCost;
          const vaultMark = state.seedVault[id] ? ' ★' : '';
          action(695 + i % 2 * 252, 358 + Math.floor(i / 2) * 48, 238, 40,
            requirement ? `${item.name}\nRequires ${requirement}`
              : `${item.name} · ${cropSolsRemaining(item, unit, this.dataSet.balance)} sols · ${foodCost.toFixed(1)} kg food${vaultMark}`,
            unit.treated && !requirement && affordable ? () => doForUnit('plant', id) : null, { size: 14 });
        });
      }
      if (unit.id === 'washer') {
        const status = unit.washStatus ?? 'idle';
        say(695, 280, washerMessages[status] ?? `1 sol per batch · ${this.dataSet.balance.washerBatchWaterL} L water required`,
          15, { color: colors.muted });
        const fill = bar(695, 311, 496, 8, Number(status === 'complete'),
          status === 'complete' ? colors.mint : colors.accent);
        if (status === 'queued' && unit.online) this.runningWasherBar = fill;
      }
      if (unit.id === 'solar') action(695, 303, 240, 43, `Clean panels · ${Math.round(unit.dust * 100)}% dust`, () => doForUnit('clean'));
      const failure = state.events.active.find(({ targetUid }) => targetUid === unit.uid);
      if (failure) {
        const remaining = failure.until - state.sol;
        say(695, 470, `Equipment outage · ${remaining} sols remaining`, 14, { color: colors.muted });
        bar(695, 494, 243, 6, 1 - remaining / (failure.until - failure.startedSol));
        action(947, 465, 240, 39, 'Repair equipment', () => doForUnit('repair'));
      }
      action(690, 548, 190, 36, 'Base shop', () => { this.selected = null; this.showShopDetails = true; this.refreshGrid(); this.drawSide(); });
      action(979, 548, 214, 36, 'Remove structure', unit.id === 'hab' ? null : () => doForUnit('demolish'));
    } else {
      this.drawBaseShop(cell);
    }
  }

  drawBaseShop(cell) {
    const { res, site, rescue } = this.sim.state;
    const group = this.sideLayer;
    const layout = this.detailsLayout ?? detailPanelLayouts.default;
    const scaleX = layout.width / 550;
    const scaleY = layout.height / 449;
    const mapX = (x) => layout.x + (x - 675) * scaleX;
    const mapY = (y) => layout.y + (y - 154) * scaleY;
    const say = (x, y, copy, size, options = {}) => {
      const adjusted = options.wordWrap
        ? { ...options, wordWrap: { ...options.wordWrap, width: options.wordWrap.width * scaleX } } : options;
      const label = text(this, mapX(x), mapY(y), copy, size, adjusted);
      group.add(label);
      return label;
    };
    const action = (...args) => {
      const [x, y, width, height, ...rest] = args;
      const { box, copy } = button(this, mapX(x), mapY(y), width * scaleX, height * scaleY, ...rest);
      group.addMultiple([box, copy]);
    };

    const placing = this.dataSet.buildings.find(({ id }) => id === this.tool);
    const instruction = cell ? `Tile ${cell.x + 1}, ${cell.y + 1} selected. Choose what to build.`
      : placing ? `Select an empty tile for ${placing.name}. Click the item again to cancel.`
        : 'Select an empty tile or choose what to build.';
    say(695, 207, instruction, 14, { color: colors.muted });

    shopCategories.forEach((category, i) => {
      action(695 + i * 103, 235, 98, 34, category.name, () => {
        this.shopCategory = category;
        this.tool = null;
        this.drawSide();
      }, { selected: category === this.shopCategory, size: 13 });
    });

    if (this.shopCategory.seeds) {
      this.dataSet.crops.forEach((crop, index) => {
        const column = index % 2;
        const rowIndex = Math.floor(index / 2);
        const x = 695 + column * 258;
        const y = 286 + rowIndex * 58;
        const requirement = this.sim.unlockRequirement(crop);
        const foodCost = this.sim.plantingFoodCost(crop.id);
        const selected = this.seedTool === crop.id;
        const fill = requirement ? 0x211a20 : selected ? 0x654333 : 0x382830;
        const card = panel(this, mapX(x), mapY(y), 250 * scaleX, 53 * scaleY, fill);
        card.setStrokeStyle(selected ? 2 : 1, selected ? colors.accent : colors.line, 0.8);
        card.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
          if (requirement) {
            this.notify(`${crop.name} requires ${requirement}.`);
            return;
          }
          const selectedUnit = this.selected && this.sim.state.buildings.find(({ x: bx, y: by }) =>
            bx === this.selected.x && by === this.selected.y);
          const selectedBuilding = selectedUnit && this.dataSet.buildings.find(({ id }) => id === selectedUnit.id);
          if (selectedUnit && selectedBuilding?.plot) {
            this.run({ type: 'plant', id: crop.id, uid: selectedUnit.uid });
            return;
          }
          this.seedTool = crop.id;
          this.tool = null;
          this.notify(`Select a greenhouse plot to plant ${crop.name}${foodCost ? ` · ${foodCost.toFixed(1)} kg food` : ''}.`);
          this.drawSide();
        });
        group.add(card);
        say(x + 10, y + 5, crop.name, 15, { fontStyle: 'bold', color: requirement ? colors.muted : colors.ink });
        const detail = requirement ? `LOCKED · ${requirement}`
          : `${cropSolsRemaining(crop, { id: 'plot' }, this.dataSet.balance)} sols${foodCost ? ` · ${foodCost.toFixed(1)} kg food` : ''}`;
        say(x + 10, y + 29, detail, 11, { color: requirement ? colors.muted : colors.muted });
      });
      return;
    }

    this.shopCategory.items.forEach((id, i) => {
      const item = this.dataSet.buildings.find((entry) => entry.id === id);
      const requirement = this.sim.unlockRequirement(item);
      const price = this.sim.purchasePrice(item);
      const shortfall = price - res.credits;
      const materials = rescue ? item.materialCost : null;
      const lacksMaterials = Object.entries(materials ?? {})
        .some(([material, amount]) => res.materials[material] < amount);
      const active = this.tool === id;
      const canBuild = !requirement && shortfall <= 0 && !lacksMaterials;
      const y = 280 + i * 56;
      const fill = canBuild ? 0x382830 : 0x211a20;
      const row = panel(this, mapX(695), mapY(y), 513 * scaleX, 50 * scaleY, fill);
      if (active) row.setStrokeStyle(2, colors.accent);
      group.add(row);
      if (canBuild) {
        row.setInteractive({ useHandCursor: true });
        row.on('pointerover', () => row.setFillStyle(0x4c343e));
        row.on('pointerout', () => row.setFillStyle(fill));
        row.on('pointerdown', () => {
          if (cell) {
            this.placeStructure(id, cell);
          } else {
            this.tool = active ? null : id;
            this.drawSide();
          }
        });
      }
      say(708, y + 6, item.name, 15, { fontStyle: 'bold', color: canBuild ? colors.ink : colors.muted });
      const description = id === 'iceDrill'
        ? `Produces ${waterOutput(item, site, this.dataSet.balance, rescue).toFixed(1)} L per sol here when powered.`
        : item.why;
      say(708, y + 28, description, 10, { color: colors.muted, wordWrap: { width: 350 } });
      const priceLabel = [`${price.toLocaleString('en-US')} cr`, formatMaterials(materials)].filter(Boolean).join(' + ');
      say(1195, y + 6, priceLabel, 13, {
        color: canBuild ? colors.ink : colors.muted, fontStyle: 'bold',
      }).setOrigin(1, 0);
      const status = requirement ? `Requires ${requirement}`
        : shortfall > 0 ? `Need ${shortfall} more cr`
          : lacksMaterials ? 'Mine more materials' : active ? 'Ready to place' : '';
      if (status) say(1195, y + 28, status, 10, { color: active ? '#9bd8ae' : '#ffc7a8' }).setOrigin(1, 0);
    });
  }
}
