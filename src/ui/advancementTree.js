import { advancementAvailable, advancements } from '../sim/advancements.js';
import { colors, panel, text } from './controls.js';

export function drawAdvancementTree(scene, group, rescue, selected, choose,
  { x: originX = 695, y: originY = 208, scaleX = 1, scaleY = 1 } = {}) {
  const width = 120 * scaleX;
  const height = 34 * scaleY;
  const position = ({ position: [column, row] }) =>
    ({ x: originX + column * 129 * scaleX, y: originY + row * 41 * scaleY });
  const earned = (id) => Object.hasOwn(rescue.earned, id);
  const starColor = (entry) => entry.id === 'rescue' ? 0xf08c3c
    : ['stranded', 'greenhouse', 'soil', 'botanist'].includes(entry.id) ? 0x70bd79 : 0xa87be5;
  const links = scene.add.graphics();
  group.add(links);

  for (const entry of advancements) {
    const target = position(entry);
    for (const parent of entry.requires) {
      const start = position(advancements.find(({ id }) => id === parent));
      const fromX = start.x + width / 2;
      const toX = target.x + width / 2;
      const fromY = start.y + height;
      const between = (fromY + target.y) / 2;
      links.lineStyle(2, earned(entry.id) ? starColor(entry) : earned(parent) ? colors.accent : colors.line);
      links.beginPath().moveTo(fromX, fromY).lineTo(fromX, between)
        .lineTo(toX, between).lineTo(toX, target.y).strokePath();
    }
  }

  for (const entry of advancements) {
    const { x, y } = position(entry);
    const done = earned(entry.id);
    const ready = advancementAvailable(rescue, entry);
    const tier = starColor(entry);
    const card = panel(scene, x, y, width, height, done ? 0x294238 : ready ? 0x492e2c : 0x211b21);
    card.setStrokeStyle(selected === entry.id ? 2 : 1, done ? tier : selected === entry.id ? colors.accent : colors.line);
    card.setInteractive({ useHandCursor: true }).on('pointerdown', () => choose(entry.id));
    group.addMultiple([card,
      scene.add.star(x + 108 * scaleX, y + 17 * scaleY, 5, 3 * scaleX, 7 * scaleY, tier).setDepth(10),
      text(scene, x + 6 * scaleX, y + 3 * scaleY, entry.name, 11, { fontStyle: 'bold', color: done || ready ? colors.ink : colors.muted }),
      text(scene, x + 6 * scaleX, y + 17 * scaleY, done ? `Earned · Sol ${rescue.earned[entry.id]}` : ready ? 'Available' : 'Locked', 10,
        { color: done ? '#9bd8ae' : ready ? '#ffc7a8' : colors.muted }),
    ]);
  }

  const clue = advancements.find(({ id }) => id === selected);
  const missing = clue.requires.filter((id) => !earned(id)).map((id) => advancements.find((entry) => entry.id === id).name);
  const detail = missing.length ? `Unlock ${missing.join(' and ')} first. ${clue.hint}` : clue.hint;
  group.add(text(scene, originX, originY + 287 * scaleY, clue.credits ? `${detail} Reward · ${clue.credits} kg materials.` : detail, 12,
    { wordWrap: { width: 505 * scaleX }, color: colors.muted }));
}

export function openColonyNameDialog(currentName, save, { heading = 'Name your colony', intro = '' } = {}) {
  const dialog = document.createElement('dialog');
  dialog.className = 'colony-name-dialog';
  dialog.innerHTML = `<form method="dialog">
    <h2></h2>
    <p class="colony-name-intro"></p>
    <label for="colony-name">Colony name</label>
    <input autofocus id="colony-name" name="name" required maxlength="28" autocomplete="off">
    <p role="alert"></p>
    <div><button value="save">Save name</button><button value="cancel" formnovalidate>Cancel</button></div>
  </form>`;
  dialog.querySelector('h2').textContent = heading;
  const introNode = dialog.querySelector('.colony-name-intro');
  introNode.textContent = intro;
  introNode.hidden = !intro;
  const input = dialog.querySelector('input');
  input.value = currentName ?? '';
  dialog.addEventListener('submit', (event) => {
    if (event.submitter?.value !== 'save') return;
    const result = save(input.value);
    if (result.ok) return;
    event.preventDefault();
    dialog.querySelector('[role="alert"]').textContent = result.reason;
  });
  dialog.addEventListener('close', () => dialog.remove(), { once: true });
  document.body.append(dialog);
  dialog.showModal();
  input.focus();
  return dialog;
}
