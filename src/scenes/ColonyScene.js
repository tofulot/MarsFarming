// AI-assisted (OpenAI Codex)
import Phaser from 'phaser';
import { Simulation, playbackSpeeds } from '../sim/Simulation.js';
import { cropSolsRemaining } from '../sim/systems/crops.js';
import { button, colors, panel, progressBar, targetBackground, text } from '../ui/controls.js';

const tileSize = 37;
const origin = { x: 48, y: 159 };
const palette = { hab: 0x83708f, solar: 0x526995, battery: 0x57566d, plot: 0x597b59,
  hydroponic: 0x447b79, iceDrill: 0x4b7c94, washer: 0x917053, berm: 0x80624c };
const washerMessages = {
  queued: '1 sol remaining · Requires power and water',
  power: 'Waiting for power · 1 sol once powered',
  water: 'Waiting for water · 1 sol once supplied',
  complete: 'Batch complete · Soil is ready to plant',
};

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
    this.timerPage = 0;
    this.showTimers = false;
    this.tool = null;
    this.message = 'Use the base shop to equip the outpost. Press 1× to advance time.';
    this.finished = false;
    this.events.once('shutdown', () => this.scene.stop('UI'));
    this.sim.on('sol', () => { this.refreshGrid(); this.drawSide(); });
    this.sim.on('event:start', (event) => this.notify(`${event.name} · ${event.until - event.startedSol} sols. ${event.fact ?? ''}`));
    this.sim.on('wash:complete', ({ plots }) => this.notify(`Soil treatment complete. ${plots} ${plots === 1 ? 'plot is' : 'plots are'} ready to plant.`));
    this.sim.on('power:shortage', () => {
      if (!this.sim.state.events.active.length) this.notify('Power shortage. Add solar arrays or preserve battery charge.');
    });
    this.sim.on('crop:died', ({ name }) => this.notify(`${name} died after going without power, water or treated soil.`));
    this.sim.on('mission:end', (state) => {
      this.finished = true;
      this.scene.start('Report', { state, options });
    });
    text(this, 48, 95, this.sim.state.site.name, 29, { fontStyle: 'bold' });
    text(this, 739, 116, 'SURFACE OPERATIONS', 15, { color: '#ff805a', fontStyle: 'bold' });
    text(this, 48, 133, 'NEXT SOL', 12, { color: colors.muted, fontStyle: 'bold' });
    this.solProgress = progressBar(this, null, 123, 137, 180, 6, 0);
    this.solStatus = text(this, 315, 132, 'Paused', 12, { color: colors.muted });
    this.tileLayer = this.add.group();
    this.sideLayer = this.add.group();
    this.feedback = text(this, 48, 620, this.message, 17, { color: '#ffc7a8', wordWrap: { width: 610 } });
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
    if (!this.sim || this.finished) return;
    const { speed } = this.sim.state;
    const tick = this.dataSet.balance.solMs;
    this.acc += Math.min(delta, tick) * speed;
    while (this.acc >= tick && !this.finished) {
      this.acc -= tick;
      this.sim.step();
    }
    this.solProgress.scaleX = this.acc / tick;
    this.solStatus.setText(speed ? `${speed}×` : 'Paused');
    if (this.runningWasherBar) this.runningWasherBar.scaleX = this.acc / tick;
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
    this.drawSide();
    return result;
  }

  select(x, y) {
    this.showTimers = false;
    this.selected = { x, y };
    if (this.tool && !this.sim.state.buildings.some((unit) => unit.x === x && unit.y === y)) {
      const result = this.run({ type: 'build', id: this.tool, x, y });
      if (result.ok) this.tool = null;
      return;
    }
    this.refreshGrid();
    this.drawSide();
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
          progressBar(this, this.tileLayer, px + 3, py + 27, 28, 4, crop.growth,
            crop.growth === 1 ? colors.mint : colors.accent);
        } else if (unit?.id === 'washer' && unit.washStatus) {
          progressBar(this, this.tileLayer, px + 3, py + 27, 28, 4,
            Number(unit.washStatus === 'complete'), colors.mint);
        }
      }
    }
  }

  drawSide() {
    this.runningWasherBar = null;
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
    const activeTimers = state.events.active.length + Number(state.res.data > 0);
    say(695, 169, this.showTimers ? 'Mission timers' : info?.name ?? 'Base shop', 24, { fontStyle: 'bold' });
    action(1060, 166, 148, 31, this.showTimers ? 'Back to base' : `Timers${activeTimers ? ` · ${activeTimers}` : ''}`,
      () => { this.showTimers = !this.showTimers; this.drawSide(); }, { selected: this.showTimers, size: 14 });
    if (this.showTimers) {
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
        progressBar(this, this.sideLayer, 695, y + 44, 496, 6, timer.fraction);
      });
      if (pages > 1) {
        action(695, 535, 52, 35, '←', this.timerPage > 0 ? () => { this.timerPage--; this.drawSide(); } : null);
        say(762, 543, `${this.timerPage + 1}/${pages}`, 15);
        action(811, 535, 52, 35, '→', this.timerPage < pages - 1 ? () => { this.timerPage++; this.drawSide(); } : null);
      }
    } else if (info) {
      say(695, 207, info.why, 15, { color: colors.muted, wordWrap: { width: 495 } });
      say(695, 245, unit.online ? 'ONLINE' : 'OFFLINE / POWER SHED', 13,
        { color: unit.online ? '#9bd8ae' : '#ff805a' });
      const doForUnit = (type, id) => this.run({ type, id, uid: unit.uid });
      if (crop) {
        const traits = this.dataSet.crops.find(({ id }) => id === crop.cropId);
        say(695, 291, `${traits.name}  ·  ${Math.round(crop.growth * 100)}% grown  ·  ${Math.round(crop.health * 100)}% health`, 18);
        const remaining = cropSolsRemaining(traits, unit, this.dataSet.balance, crop.growth);
        const status = !remaining ? 'Ready to harvest' : `${remaining} growing sols remaining`;
        say(695, 327, status, 15, { color: colors.muted });
        progressBar(this, this.sideLayer, 695, 355, 496, 8, crop.growth, remaining ? colors.accent : colors.mint);
        if (remaining) say(695, 375, !unit.online ? 'Growth stalled last sol · No power' :
          unit.watered ? 'Water supplied last sol' :
            state.sol === crop.plantedSol ? 'Growth begins next sol' : 'Growth stalled last sol · No water',
        14, { color: colors.muted });
        action(695, 416, 210, 41, 'Harvest', crop.growth === 1 ? () => doForUnit('harvest') : null);
        action(922, 416, 270, 41, 'Harvest and replant', crop.growth === 1 ? () => {
          if (doForUnit('harvest').ok) doForUnit('plant', traits.id);
        } : null);
      } else if (info.plot) {
        say(695, 279, unit.treated ? 'Choose a crop' : 'Untreated soil. Run a Soil Washer batch.', 17);
        this.dataSet.crops.slice(0, 8).forEach((item, i) => {
          action(695 + i % 2 * 252, 318 + Math.floor(i / 2) * 48, 238, 40,
            `${item.name} · ${cropSolsRemaining(item, unit, this.dataSet.balance)} sols`,
            unit.treated ? () => doForUnit('plant', item.id) : null, { size: 14 });
        });
      }
      if (unit.id === 'washer') {
        const status = unit.washStatus ?? 'idle';
        say(695, 280, washerMessages[status] ?? `1 sol per batch · ${this.dataSet.balance.washerBatchWaterL} L water required`,
          15, { color: colors.muted });
        const fill = progressBar(this, this.sideLayer, 695, 311, 496, 8, Number(status === 'complete'),
          status === 'complete' ? colors.mint : colors.accent);
        if (status === 'queued' && unit.online) this.runningWasherBar = fill;
        action(695, 342, 240, 40, unit.pending ? 'Treatment queued' : 'Treat soil · 1 sol', unit.pending ? null : () => doForUnit('wash'));
      }
      if (unit.id === 'solar') action(695, 303, 240, 43, `Clean panels · ${Math.round(unit.dust * 100)}% dust`, () => doForUnit('clean'));
      const failure = state.events.active.find(({ targetUid }) => targetUid === unit.uid);
      if (failure) {
        const remaining = failure.until - state.sol;
        say(695, 470, `Equipment outage · ${remaining} sols remaining`, 14, { color: colors.muted });
        progressBar(this, this.sideLayer, 695, 494, 243, 6, 1 - remaining / (failure.until - failure.startedSol));
        action(947, 465, 240, 39, 'Repair equipment', () => doForUnit('repair'));
      }
      action(690, 548, 190, 36, 'Base shop', () => { this.selected = null; this.refreshGrid(); this.drawSide(); });
      action(979, 548, 214, 36, 'Remove structure', unit.id === 'hab' ? null : () => doForUnit('demolish'));
    } else {
      const entries = this.dataSet.buildings.filter(({ id }) => id !== 'hab');
      const pageSize = 10;
      const pages = Math.ceil(entries.length / pageSize);
      say(695, 207, 'Choose a structure, then click an empty tile to buy and build.', 16, { color: colors.muted });
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
      const spares = this.dataSet.balance.kit.find(({ id }) => id === 'spares');
      action(695, 550, 220, 35, `Buy spare part · ${spares.cost} cr`,
        () => this.run({ type: 'buySpares' }), { size: 14 });
      say(933, 558, `Spares in storage: ${state.res.spares}`, 14, { color: colors.muted });
    }
    for (const [i, speed] of playbackSpeeds.entries()) {
      action(678 + i * 58, 633, 52, 42, speed ? `${speed}×` : 'Pause',
        () => this.run({ type: 'setSpeed', speed }, false), { selected: state.speed === speed, size: 14 });
    }
    action(973, 633, 86, 42, '+1 sol', () => { this.acc = 0; this.sim.step(); }, { size: 14 });
    action(1067, 633, 157, 42, 'End and report', () => this.run({ type: 'endMission' }), { size: 14 });
  }
}
