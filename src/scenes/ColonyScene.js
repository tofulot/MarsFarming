// AI-assisted (OpenAI Codex)
import Phaser from 'phaser';
import { Simulation } from '../sim/Simulation.js';
import { formatGenotype } from '../sim/systems/mutations.js';
import { button, colors, panel, targetBackground, text } from '../ui/controls.js';

const tileSize = 37;
const origin = { x: 48, y: 159 };
const palette = { hab: 0x83708f, solar: 0x526995, battery: 0x57566d, plot: 0x597b59,
  hydroponic: 0x447b79, iceDrill: 0x4b7c94, washer: 0x917053, berm: 0x80624c };

export class ColonyScene extends Phaser.Scene {
  constructor() { super('Colony'); }

  create(options) {
    targetBackground(this);
    this.options = options;
    this.dataSet = this.registry.get('missionData');
    this.sim = new Simulation(this.dataSet, options);
    this.sim.command({ type: 'setSpeed', speed: 0 });
    this.acc = 0;
    this.selected = null;
    this.buildPage = 0;
    this.tool = null;
    this.breedMotherUid = null;
    this.message = 'Choose a building, then click an empty tile. Press 1× to advance time.';
    this.finished = false;
    this.events.once('shutdown', () => this.scene.stop('UI'));
    this.sim.on('sol', () => this.refreshGrid());
    this.sim.on('event:start', (event) => this.notify(`${event.name}. ${event.fact}`));
    this.sim.on('power:shortage', () => {
      if (!this.sim.state.events.active.length) this.notify('Power shortage. Add solar arrays or preserve battery charge.');
    });
    this.sim.on('crop:died', ({ name }) => this.notify(`${name} died after going without power, water or treated soil.`));
    this.sim.on('mission:end', (state) => {
      this.finished = true;
      this.scene.start('Report', { state, options });
    });
    text(this, 48, 95, this.dataSet.sites.find(({ id }) => id === options.siteId).name, 29, { fontStyle: 'bold' });
    text(this, 739, 116, 'SURFACE OPERATIONS', 15, { color: '#ff805a', fontStyle: 'bold' });
    this.tileLayer = this.add.group();
    this.sideLayer = this.add.group();
    this.feedback = text(this, 48, 620, this.message, 17, { color: '#ffc7a8', wordWrap: { width: 665 } });
    text(this, 48, 676, this.dataSet.demoWeather ? 'SIMULATED WEATHER  /  GAME VALUES' : 'GAME VALUES', 12, { color: colors.muted });
    this.refreshGrid();
    this.drawSide();
    this.scene.launch('UI', { sim: this.sim });
    if (options.demo) {
      this.input.keyboard.on('keydown-ONE', () => this.run({ type: 'triggerEvent', id: 'dustRegional' }, false));
      this.input.keyboard.on('keydown-TWO', () => this.run({ type: 'triggerEvent', id: 'spe' }, false));
      this.input.keyboard.on('keydown-F', () => { for (let i = 0; i < 30 && !this.finished; i++) this.sim.step(); });
      this.input.keyboard.on('keydown-CLOSED_BRACKET', () => this.run({ type: 'setSpeed', speed: 4 }, false));
      this.input.keyboard.on('keydown-R', () => this.run({ type: 'endMission' }, false));
    }
  }

  update(_, delta) {
    if (!this.sim || this.finished || !this.sim.state.speed) return;
    const tick = this.dataSet.balance.solMs;
    this.acc += Math.min(delta, tick) * this.sim.state.speed;
    while (this.acc >= tick && !this.finished) {
      this.acc -= tick;
      this.sim.step();
    }
  }

  notify(copy) {
    this.message = copy;
    this.feedback?.setText(copy);
  }

  run(command, showResult = true) {
    const result = this.sim.command(command);
    if (this.finished) return result;
    if (showResult || !result.ok) this.notify(result.reason);
    this.refreshGrid();
    if (!this.selected) this.drawSide();
    return result;
  }

  select(x, y) {
    this.selected = { x, y };
    if (this.tool && !this.sim.state.buildings.some((unit) => unit.x === x && unit.y === y)) {
      if (this.run({ type: 'build', id: this.tool, x, y }).ok) this.tool = null;
      return;
    }
    this.refreshGrid();
  }

  refreshGrid() {
    this.tileLayer.clear(true, true);
    const { buildings, crops, grid } = this.sim.state;
    for (let y = 0; y < grid.h; y++) {
      for (let x = 0; x < grid.w; x++) {
        const px = origin.x + x * tileSize;
        const py = origin.y + y * tileSize;
        const unit = buildings.find((building) => building.x === x && building.y === y);
        const selected = this.selected?.x === x && this.selected.y === y;
        const crop = unit && crops.find(({ plotUid }) => plotUid === unit.uid);
        const fill = unit ? (unit.online ? palette[unit.id] ?? 0x7c5d66 : 0x54333a) :
          ((x + y) % 2 ? 0x322027 : 0x3d2730);
        const tile = panel(this, px, py, tileSize - 2, tileSize - 2, fill);
        if (selected) tile.setStrokeStyle(2, colors.accent);
        tile.setInteractive({ useHandCursor: true }).on('pointerdown', () => this.select(x, y));
        this.tileLayer.add(tile);
        if (unit) {
          const label = this.dataSet.buildings.find(({ id }) => id === unit.id).sprite;
          this.tileLayer.add(text(this, px + 17, py + 9, label, 10, { fontStyle: 'bold' }).setOrigin(.5, 0));
        }
        if (crop) {
          const progress = this.add.rectangle(px + 3, py + 27, 28 * crop.growth, 4,
            crop.growth === 1 ? colors.mint : colors.accent).setOrigin(0);
          this.tileLayer.add(progress);
        }
      }
    }
    if (this.selected) this.drawSide();
  }

  drawSide() {
    this.sideLayer.clear(true, true);
    const add = (item) => this.sideLayer.add(item);
    const say = (...args) => add(text(this, ...args));
    const action = (...args) => {
      const { box, copy } = button(this, ...args);
      add(box);
      add(copy);
    };
    const state = this.sim.state;
    const cell = this.selected;
    const unit = cell && state.buildings.find((entry) => entry.x === cell.x && entry.y === cell.y);
    const info = unit && this.dataSet.buildings.find(({ id }) => id === unit.id);
    const crop = unit && state.crops.find(({ plotUid }) => plotUid === unit.uid);
    add(panel(this, 675, 154, 550, 449));
    say(695, 169, info ? info.name : 'Build outpost', 24, { fontStyle: 'bold' });
    if (info) {
      say(695, 207, info.why, 15, { color: colors.muted, wordWrap: { width: 495 } });
      say(695, 245, unit.online ? 'ONLINE' : 'OFFLINE / POWER SHED', 13,
        { color: unit.online ? '#9bd8ae' : '#ff805a' });
      const doForUnit = (type, id, extra = {}) => this.run({ type, id, uid: unit.uid, ...extra });
      if (crop) {
        const traits = this.dataSet.crops.find(({ id }) => id === crop.cropId);
        const lineage = state.lineages[crop.lineageId];
        const generation = lineage?.generation;
        const gen = generation ? `  ·  gen ${generation}` : '';
        const genes = lineage?.genotype && this.dataSet.mutations
          ? formatGenotype(lineage.genotype, this.dataSet.mutations) : '';
        say(695, 291, `${traits.name}  ·  ${Math.round(crop.growth * 100)}% grown  ·  ${Math.round(crop.health * 100)}% health${gen}`, 18);
        say(695, 318, genes || (unit.watered ? 'Water supplied last sol' : 'Water unavailable or unmeasured'), 14,
          { color: colors.muted, wordWrap: { width: 500 } });
        const mature = crop.growth === 1;
        action(695, 355, 210, 38, 'Harvest', mature ? () => doForUnit('harvest') : null);
        if (this.breedMotherUid == null) {
          action(922, 355, 270, 38, 'Set as mother', mature ? () => {
            this.breedMotherUid = crop.uid;
            this.notify(`Mother set: ${traits.name}. Select a mature father of the same crop, or self-cross.`);
            this.drawSide();
          } : null);
        } else if (this.breedMotherUid === crop.uid) {
          action(922, 355, 130, 38, 'Self-cross', mature ? () => {
            const result = this.run({ type: 'cross', motherUid: crop.uid, fatherUid: crop.uid });
            this.breedMotherUid = null;
            if (result.ok) this.drawSide();
          } : null);
          action(1060, 355, 130, 38, 'Cancel', () => {
            this.breedMotherUid = null;
            this.notify('Breeding cancelled.');
            this.drawSide();
          });
        } else {
          const mother = state.crops.find(({ uid }) => uid === this.breedMotherUid);
          const canCross = mature && mother && mother.cropId === crop.cropId;
          action(922, 355, 130, 38, 'Cross here', canCross ? () => {
            const result = this.run({
              type: 'cross', motherUid: this.breedMotherUid, fatherUid: crop.uid,
            });
            this.breedMotherUid = null;
            if (result.ok) this.drawSide();
          } : null);
          action(1060, 355, 130, 38, 'Cancel', () => {
            this.breedMotherUid = null;
            this.notify('Breeding cancelled.');
            this.drawSide();
          });
        }
      } else if (info.plot) {
        say(695, 279, unit.treated ? 'Choose a crop' : 'Untreated soil. Run a Soil Washer batch.', 17);
        const vaulted = Object.entries(state.seedVault ?? {});
        if (unit.treated && vaulted.length) {
          say(695, 300, `Seed vault: ${vaulted.map(([cropId]) => cropId).join(', ')} ★`, 13, { color: colors.muted });
        }
        this.dataSet.crops.slice(0, 8).forEach((item, i) => {
          const vaultMark = state.seedVault[item.id] ? ' ★' : '';
          action(695 + i % 2 * 252, 318 + Math.floor(i / 2) * 48, 238, 40,
            `${item.name} · ${item.growthSols} sols${vaultMark}`,
            unit.treated ? () => doForUnit('plant', item.id) : null, { size: 14 });
        });
      }
      if (unit.id === 'washer') action(695, 303, 245, 43, unit.pending ? 'Treatment queued' : 'Treat soil',
        unit.pending ? null : () => doForUnit('wash'));
      if (unit.id === 'solar') action(695, 303, 240, 43, `Clean panels · ${Math.round(unit.dust * 100)}% dust`, () => doForUnit('clean'));
      if (state.events.active.some(({ targetUid }) => targetUid === unit.uid)) {
        action(947, 303, 240, 43, 'Repair equipment', () => doForUnit('repair'));
      }
      action(690, 548, 190, 36, 'Build menu', () => { this.selected = null; this.refreshGrid(); this.drawSide(); });
      action(979, 548, 214, 36, 'Remove structure', unit.id === 'hab' ? null : () => doForUnit('demolish'));
    } else {
      const entries = this.dataSet.buildings.filter(({ id }) => id !== 'hab');
      const pageSize = 10;
      const pages = Math.ceil(entries.length / pageSize);
      say(695, 207, 'Pick a structure, then click an empty tile.', 16, { color: colors.muted });
      entries.slice(this.buildPage * pageSize, (this.buildPage + 1) * pageSize).forEach((item, i) => {
        const active = this.tool === item.id;
        const cost = state.res.sp < item.unlockSP ? `${item.unlockSP} SP` : `${item.cost} cr`;
        action(695 + i % 2 * 252, 252 + Math.floor(i / 2) * 49, 238, 41, `${item.name} · ${cost}`,
          () => { this.tool = active ? null : item.id; this.notify(item.why); this.drawSide(); }, { selected: active, size: 15 });
      });
      action(695, 507, 59, 34, '←', this.buildPage > 0 ? () => { this.buildPage--; this.drawSide(); } : null);
      say(772, 514, `${this.buildPage + 1}/${pages}`, 14, { color: colors.muted });
      action(820, 507, 59, 34, '→', this.buildPage < pages - 1 ? () => { this.buildPage++; this.drawSide(); } : null);
      action(911, 507, 274, 34,
        state.power.priority[0] === 'iceDrill' ? 'Power order · Water first' : 'Power order · Farm first',
        () => this.run({ type: 'setPriority', priority: state.power.priority[0] === 'iceDrill'
          ? ['plot', 'hydroponic', 'iceDrill'] : ['iceDrill', 'recycler', 'plot', 'hydroponic'] }), { size: 14 });
      say(695, 563, 'Life support receives power first.', 14, { color: colors.muted });
    }
    for (const [i, speed] of [0, 1, 2, 4].entries()) {
      action(678 + i * 71, 633, 64, 42, speed ? `${speed}×` : 'Pause',
        () => this.run({ type: 'setSpeed', speed }, false), { selected: state.speed === speed, size: 14 });
    }
    action(973, 633, 86, 42, '+1 sol', () => this.sim.step(), { size: 14 });
    action(1067, 633, 157, 42, 'End and report', () => this.run({ type: 'endMission' }), { size: 14 });
  }
}
