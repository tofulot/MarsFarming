import { advancementAvailable, advancements } from '../sim/advancements.js';
import { colors, panel, text } from './controls.js';

export function drawAdvancementTree(scene, group, rescue, selected, choose) {
  const width = 120;
  const height = 34;
  const position = ({ position: [column, row] }) =>
    ({ x: 695 + column * 129, y: 208 + row * 41 });
  const earned = (id) => Object.hasOwn(rescue.earned, id);
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
      links.lineStyle(2, earned(entry.id) ? colors.mint : earned(parent) ? colors.accent : colors.line);
      links.beginPath().moveTo(fromX, fromY).lineTo(fromX, between)
        .lineTo(toX, between).lineTo(toX, target.y).strokePath();
    }
  }

  for (const entry of advancements) {
    const { x, y } = position(entry);
    const done = earned(entry.id);
    const ready = advancementAvailable(rescue, entry);
    const card = panel(scene, x, y, width, height, done ? 0x294238 : ready ? 0x492e2c : 0x211b21);
    if (selected === entry.id) card.setStrokeStyle(2, colors.accent);
    card.setInteractive({ useHandCursor: true }).on('pointerdown', () => choose(entry.id));
    group.addMultiple([card,
      text(scene, x + 6, y + 3, entry.name, 12, { fontStyle: 'bold', color: done || ready ? colors.ink : colors.muted }),
      text(scene, x + 6, y + 17, done ? `Earned · Sol ${rescue.earned[entry.id]}` : ready ? 'Available' : 'Locked', 11,
        { color: done ? '#9bd8ae' : ready ? '#ffc7a8' : colors.muted }),
    ]);
  }

  const clue = advancements.find(({ id }) => id === selected);
  const missing = clue.requires.filter((id) => !earned(id)).map((id) => advancements.find((entry) => entry.id === id).name);
  const detail = missing.length ? `Unlock ${missing.join(' and ')} first. ${clue.hint}` : clue.hint;
  group.add(text(scene, 695, 495, clue.credits ? `${detail} Reward · ${clue.credits} cr.` : detail, 13,
    { wordWrap: { width: 505 }, color: colors.muted }));
}

export function openColonyNameDialog(currentName, save) {
  const dialog = document.createElement('dialog');
  dialog.className = 'colony-name-dialog';
  dialog.innerHTML = `<form method="dialog">
    <h2>Name your colony</h2>
    <label for="colony-name">Colony name</label>
    <input autofocus id="colony-name" name="name" required maxlength="28" autocomplete="off">
    <p role="alert"></p>
    <div><button value="save">Save name</button><button value="cancel" formnovalidate>Cancel</button></div>
  </form>`;
  const input = dialog.querySelector('input');
  input.value = currentName;
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
