const dominantColor = 0x6ca96e;
const recessiveColor = 0x766f67;
const flippedColor = 0xe5b052;

/** Draw per-locus chips from sim.cropGenetics(crop) without coupling to simulation state. */
export function drawGeneticsChips(scene, group, loci = [], { x = 695, y = 0, maxWidth = 500 } = {}) {
  let cursorX = x;
  let cursorY = y;
  const rowHeight = 26;
  for (const locus of loci) {
    const pair = Array.isArray(locus.alleles) ? locus.alleles : [...String(locus.alleles ?? locus.label ?? '')];
    const symbols = pair.map((allele) => typeof allele === 'object' ? String(allele.symbol ?? allele.value ?? '') : String(allele));
    const width = Math.max(48, symbols.join('').length * 7 + 26);
    if (cursorX + width > x + maxWidth) {
      cursorX = x;
      cursorY += rowHeight + 5;
    }
    const hasFlip = locus.flipped || pair.some((allele) => typeof allele === 'object' && allele.flipped);
    const color = hasFlip ? flippedColor : locus.dominant ? dominantColor : recessiveColor;
    const plate = scene.add.rectangle(cursorX + width / 2, cursorY + rowHeight / 2, width, rowHeight,
      0x2e2723, 0.98).setStrokeStyle(hasFlip ? 2 : 1, color, 1).setDepth(22);
    const locusLabel = scene.add.text(cursorX + 5, cursorY + 2, locus.id ?? '', {
      fontFamily: 'Arial', fontSize: 8, color: '#cba58c',
    }).setDepth(23);
    const alleleText = pair.map((allele, index) => {
      const symbol = symbols[index];
      const dominant = typeof allele === 'object' && typeof allele.dominant === 'boolean'
        ? allele.dominant : symbol === symbol.toUpperCase();
      const alleleFlipped = typeof allele === 'object' ? allele.flipped : locus.flipped;
      const alleleColor = alleleFlipped ? flippedColor : dominant ? dominantColor : recessiveColor;
      const text = scene.add.text(cursorX + 7 + index * 12, cursorY + 11, symbol, {
        fontFamily: 'monospace', fontSize: 12, fontStyle: 'bold',
        color: `#${alleleColor.toString(16).padStart(6, '0')}`,
      }).setDepth(23);
      return text;
    });
    group?.addMultiple([plate, locusLabel, ...alleleText]);
    cursorX += width + 6;
  }
  return cursorY + rowHeight;
}

/** Brief visual cue for a mutation event; solar boosted flips use a brighter spark. */
export function playMutationSpark(scene, x, y, { solarBoosted = false, flips = [] } = {}) {
  const tint = solarBoosted ? 0xffa447 : 0x95dfb0;
  const effects = [];
  const count = Math.min(8, Math.max(3, flips.length));
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count;
    const spark = scene.add.star(x, y, 4, 2, solarBoosted ? 8 : 6, tint).setDepth(40);
    effects.push(spark);
    scene.tweens.add({ targets: spark,
      x: x + Math.cos(angle) * (solarBoosted ? 29 : 20),
      y: y + Math.sin(angle) * (solarBoosted ? 29 : 20),
      alpha: 0, scale: 0.2, angle: 95, duration: solarBoosted ? 720 : 520,
      onComplete: () => spark.destroy(),
    });
  }
  const flash = scene.add.circle(x, y, solarBoosted ? 14 : 10, tint, 0.42).setDepth(39);
  effects.push(flash);
  scene.tweens.add({ targets: flash, scale: 2.8, alpha: 0, duration: solarBoosted ? 500 : 340,
    onComplete: () => flash.destroy(),
  });
  return effects;
}

/** Subscribe without owning scene wiring; getPlotPosition maps a plot UID to board pixels. */
export function attachMutationSparks(scene, sim, getPlotPosition) {
  const unsubscribe = sim.on('mutation:alleleFlip', (event) => {
    const position = getPlotPosition(event.plotUid);
    if (!position) return;
    playMutationSpark(scene, position.x, position.y, event);
  });
  scene.events.once('shutdown', unsubscribe);
  return unsubscribe;
}
