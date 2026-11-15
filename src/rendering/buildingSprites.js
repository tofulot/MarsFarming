const spriteTypes = new Set(['washer', 'autoHarvester', 'iceDrill', 'nuclear', 'rockProp']);

export function drawBuildingSprite(graphic, id, x, y, size, online) {
  if (!spriteTypes.has(id)) return false;
  graphic.save().translateCanvas(x, y).scaleCanvas(size / 36, size / 36);
  const shell = online ? 0xdcc6a2 : 0x8c796d;
  const trim = online ? 0x86b1a7 : 0x726d65;
  const dark = 0x51463e;
  switch (id) {
    case 'washer':
      graphic.fillStyle(dark).fillRoundedRect(4, 8, 28, 22, 4);
      graphic.fillStyle(shell).fillRoundedRect(6, 5, 11, 23, 3);
      graphic.fillStyle(trim).fillRoundedRect(19, 8, 11, 20, 3);
      graphic.lineStyle(2, dark).lineBetween(8, 15, 15, 15).lineBetween(21, 17, 28, 17);
      break;
    case 'autoHarvester':
      graphic.fillStyle(dark).fillRoundedRect(4, 12, 28, 15, 6);
      graphic.fillStyle(shell).fillRoundedRect(8, 8, 17, 15, 3);
      graphic.fillStyle(trim).fillRect(12, 10, 10, 4);
      graphic.lineStyle(2, 0xdaa855).lineBetween(24, 21, 32, 28).lineBetween(25, 30, 34, 30);
      break;
    case 'iceDrill':
      graphic.fillStyle(dark).fillRoundedRect(6, 23, 24, 7, 2);
      graphic.lineStyle(3, shell).lineBetween(10, 22, 17, 5).lineBetween(17, 5, 25, 22);
      graphic.lineStyle(2, trim).lineBetween(17, 9, 17, 27).lineBetween(11, 19, 24, 19);
      break;
    case 'nuclear':
      graphic.fillStyle(dark).fillRoundedRect(5, 11, 26, 18, 3);
      graphic.fillStyle(shell).fillRoundedRect(11, 6, 14, 21, 5);
      graphic.fillStyle(online ? 0xe4ad51 : trim).fillCircle(18, 15, 5);
      graphic.lineStyle(2, dark).lineBetween(9, 23, 27, 23);
      break;
    case 'rockProp':
      graphic.fillStyle(0x4e403a).fillTriangle(4, 27, 14, 8, 31, 27);
      graphic.lineStyle(2, 0xa88a76).lineBetween(6, 26, 14, 9);
      break;
  }
  graphic.restore();
  return true;
}
