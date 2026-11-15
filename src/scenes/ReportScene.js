// AI-assisted (OpenAI Codex; colours aligned with the HUD tokens by Claude)
import Phaser from 'phaser';
import { advancements } from '../sim/advancements.js';
import { playAchievementToasts } from '../ui/achievementToasts.js';
import { button, colors, heading, label, panel, targetBackground, text } from '../ui/controls.js';
import { liftVeil } from '../ui/veil.js';

export class ReportScene extends Phaser.Scene {
  constructor() { super('Report'); }

  create({ state, options, journal = false, pendingAwards = [], fromCutscene = false }) {
    // After the rescue cutscene: fade in from black, then play the awards.
    const fadeInMs = fromCutscene ? liftVeil() : 0;
    targetBackground(this);
    const data = this.registry.get('missionData');
    const objective = data.objectives.find(({ id }) => id === state.objectiveId);
    const result = state.objectives[objective.id];
    const report = { state, options };
    if (journal) {
      heading(this, 'MISSION REPORT / JOURNAL', 'Crop discoveries', 'A powered lab records harvests. A comms dish sends the results to Earth.');
      data.seasons.seasonNamesNorth.forEach((name, i) => label(this, 313 + i * 220, 200, name, { color: colors.label }));
      data.crops.forEach((crop, row) => {
        const y = 243 + row * 47;
        text(this, 57, y + 10, crop.name, 17);
        for (let season = 0; season < 4; season++) {
          const entry = state.journal[`${crop.id}:${season}`];
          const x = 300 + 220 * season;
          panel(this, x, y, 205, 38, entry?.transmitted ? 0x2b3f31 : colors.panel, 6);
          text(this, x + 13, y + 10, entry?.transmitted ? 'Downlinked' : entry ? 'Queued' : '—', 14,
            { color: entry ? colors.ink : colors.muted });
        }
      });
      button(this, 56, 636, 176, 48, 'Back to report', () => this.scene.restart(report));
      return;
    }
    if (state.rescue) {
      const { outcome, colonyName, arrivalSol, earned } = state.rescue;
      const title = outcome === 'rescued' ? 'Rescue successful' : outcome === 'abandoned' ? 'Mission abandoned' : 'Rescue missed';
      heading(this, 'SURVIVAL REPORT', title, state.endReason);
      panel(this, 56, 196, 445, 397);
      text(this, 78, 220, colonyName || 'Unnamed colony', 30,
        { fontStyle: '800', wordWrap: { width: 400 } });
      text(this, 78, 305, `Sols survived    ${state.sol} / ${arrivalSol}
Health    ${Math.round(state.crew.health * 100)}%
Food grown    ${state.metrics.grownKg.toFixed(1)} kg`,
        19, { lineSpacing: 12 });
      panel(this, 521, 196, 703, 397);
      label(this, 547, 222, 'Achievements');
      const awards = advancements.filter(({ id }) => Object.hasOwn(earned, id));
      if (!awards.length) text(this, 547, 265, 'No achievements earned.', 17, { color: colors.muted });
      awards.forEach(({ id, name }, i) => {
        text(this, 547 + 325 * Math.floor(i / 7), 263 + 31 * (i % 7), `${name}  ·  Sol ${earned[id]}`, 18);
      });
      button(this, 56, 636, 139, 48, 'Main menu', () => this.scene.start('Title'));
      button(this, 221, 636, 187, 48, 'Crop journal', () => this.scene.restart({ ...report, journal: true }));
      button(this, 950, 636, 274, 48, 'Try another landing site →',
        () => this.scene.start('Map', options), { selected: true });
      if (fadeInMs) this.time.delayedCall(fadeInMs, () => playAchievementToasts(this, pendingAwards, 42));
      else playAchievementToasts(this, pendingAwards, 42);
      return;
    }
    heading(this, 'MISSION REPORT', objective.name, `${state.endReason}  ${result.completed ? 'Objective met.' : 'Objective incomplete.'}`);
    panel(this, 56, 196, 428, 397);
    label(this, 78, 217, 'Mission score');
    text(this, 73, 239, `${state.score.total}/100`, 76, { fontStyle: '800' });
    const delta = options.previousScore == null ? '' : ` · ${state.score.total - options.previousScore >= 0 ? '+' : ''}${state.score.total - options.previousScore} vs prior flight`;
    text(this, 78, 342, `Sol ${state.sol}  ·  ${Math.round(state.crew.health * 100)}% crew health${delta}`, 16, { color: colors.muted });
    Object.entries(state.score.parts).forEach(([key, score], i) => {
      const max = objective.weights[key];
      const row = 386 + 38 * i;
      text(this, 78, row, key[0].toUpperCase() + key.slice(1), 15);
      panel(this, 179, row + 4, 211, 10, colors.sunken);
      if (score) panel(this, 179, row + 4, 211 * score / max, 10, colors.mint).setStrokeStyle();
      text(this, 406, row - 1, `${score}/${max}`, 15);
    });
    panel(this, 504, 196, 720, 397);
    label(this, 527, 217, 'What shaped the mission');
    const launch = state.decisions[0];
    text(this, 527, 249, `${launch.text} ${launch.effect}`, 16, { wordWrap: { width: 665 } });
    const harvest = state.metrics.grownKg.toFixed(1);
    text(this, 527, 310, `Harvests supplied ${harvest} kg of dry food. ${state.metrics.transmitted} research packets reached Earth.`, 16,
      { wordWrap: { width: 665 } });
    text(this, 527, 366, `Loads were shed on ${state.metrics.shortages} sols. The crew lacked drinking water on ${state.metrics.lowWaterSols} sols.`, 16,
      { wordWrap: { width: 665 } });
    const event = state.events.log.find(({ id }) => id.startsWith('dust')) ?? state.events.log.at(-1);
    if (event) text(this, 527, 419, `${event.name} on sol ${event.sol}. ${event.fact}`, 16,
      { color: '#ffc7a8', wordWrap: { width: 665 } });
    const fact = data.facts[0];
    text(this, 527, 502, `${fact.text} [${fact.source}]`, 15, { color: colors.muted, wordWrap: { width: 644 } });
    button(this, 56, 636, 139, 48, 'Main menu', () => this.scene.start('Title'));
    button(this, 221, 636, 187, 48, 'Crop journal', () => this.scene.restart({ ...report, journal: true }));
    button(this, 950, 636, 274, 48, 'Redesign and re-fly →',
      () => this.scene.start('Map', { ...options, previousScore: state.score.total }), { selected: true });
  }
}
