import { advancements } from '../sim/advancements.js';
import { colors, panel, text } from './controls.js';

export function drawAdvancementTree(scene, group, rescue, selected, choose) {
  const origin = { x: 696, y: 213 };
  const position = ({ position: [column, row] }) =>
    ({ x: origin.x + column * 264, y: origin.y + row * 56 });
  const links = scene.add.graphics();
  group.add(links);
  for (const entry of advancements) {
    const { x, y } = position(entry);
    for (const parent of entry.requires) {
      const start = position(advancements.find(({ id }) => id === parent));
      links.lineStyle(2, colors.line).lineBetween(start.x + 115, start.y + 49, x + 115, y);
    }
  }
  for (const entry of advancements) {
    const { x, y } = position(entry);
    const earned = Object.hasOwn(rescue.earned, entry.id);
    const ready = entry.requires.every((id) => Object.hasOwn(rescue.earned, id));
    const card = panel(scene, x, y, 230, 49, earned ? 0x294238 : 0x30232b);
    if (selected === entry.id) card.setStrokeStyle(2, colors.accent);
    card.setInteractive({ useHandCursor: true }).on('pointerdown', () => choose(entry.id));
    group.addMultiple([card,
      text(scene, x + 12, y + 6, entry.name, 16, { fontStyle: 'bold' }),
      text(scene, x + 12, y + 29, earned ? `Earned on sol ${rescue.earned[entry.id]}` : ready ? 'Available' : 'Locked', 12,
        { color: earned ? '#9bd8ae' : colors.muted }),
    ]);
  }
  const clue = advancements.find(({ id }) => id === selected);
  group.add(text(scene, 696, 500, clue.hint, 15, { wordWrap: { width: 495 }, color: colors.muted }));
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
