// AI-assisted (Cursor Grok)
// Diploid Mendelian loci. Phenotype is derived from genotype.
// Dose uses balance.crewRadiationPerSol (S11). Allele flip rates are game values.

export function emptyStress() {
  return { dose_mSv: 0, lowPowerSols: 0, coldSols: 0, drySols: 0, perchlorateSols: 0 };
}

function clamp(value, lo, hi) {
  return Math.min(hi, Math.max(lo, value));
}

function orderPair(a, b) {
  return a === b ? [a, b] : (a < b ? [a, b] : [b, a]);
}

export function wildGenotype(rules) {
  const genotype = {};
  for (const locus of rules.loci) {
    const recessive = locus.alleles.find((allele) => allele === allele.toLowerCase());
    const wild = locus.id === 'growth' ? locus.dominant : recessive;
    genotype[locus.id] = [wild, wild];
  }
  return genotype;
}

export function formatGenotype(genotype, rules) {
  return rules.loci.map((locus) => {
    const [a, b] = genotype[locus.id];
    return `${a}${b}`;
  }).join(' ');
}

/** Structured alleles for UI highlighting (matches colony genetics chips contract). */
export function describeGenetics(genotype, rules, flips = []) {
  return (rules?.loci ?? []).map((locus) => {
    const pair = genotype?.[locus.id] ?? ['?', '?'];
    const remainingFlips = (flips ?? []).filter((flip) => flip.locus === locus.id);
    const alleles = pair.map((symbol) => {
      const index = remainingFlips.findIndex((flip) => flip.to === symbol);
      if (index >= 0) remainingFlips.splice(index, 1);
      return {
        symbol,
        dominant: locus.dominance === 'incomplete'
          ? symbol === symbol.toUpperCase()
          : symbol === locus.dominant,
        flipped: index >= 0,
      };
    });
    return {
      id: locus.id,
      alleles,
      label: pair.join(''),
      dominant: alleles.some((allele) => allele.dominant),
      flipped: alleles.some((allele) => allele.flipped),
    };
  });
}

export function phenotype(genotype, rules) {
  const traits = { ppf: 1, heat: 1, yield: 1, growth: 1, rad: 0, perchlorate: 0 };
  for (const locus of rules.loci) {
    const [a, b] = genotype[locus.id];
    let patch;
    if (locus.dominance === 'incomplete') {
      const key = `${a}${b}`;
      const alt = `${b}${a}`;
      patch = locus.phenotype[key] ?? locus.phenotype[alt];
    } else {
      const hasDominant = a === locus.dominant || b === locus.dominant;
      patch = hasDominant ? locus.phenotype.dominant : locus.phenotype.recessive;
    }
    Object.assign(traits, patch);
  }
  return traits;
}

export function lineagePhenotype(state, crop, rules) {
  const lineage = state.lineages[crop?.lineageId];
  if (!lineage?.genotype || !rules) return { ppf: 1, heat: 1, yield: 1, growth: 1, rad: 0, perchlorate: 0 };
  return phenotype(lineage.genotype, rules);
}

export function mutationChance(dose_mSv, rules, difficulty, { solarActive = false } = {}) {
  const mult = rules.difficultyMult[difficulty] ?? 1;
  const solar = solarActive ? (rules.speMutationMult ?? 1) : 1;
  return clamp(
    rules.baseMutationPerAllele * mult * solar * (1 + dose_mSv / rules.doseScale_mSv),
    0,
    rules.maxMutationPerAllele,
  );
}

function flipAllele(allele, locus) {
  return allele === locus.alleles[0] ? locus.alleles[1] : locus.alleles[0];
}

export function gamete(genotype, dose_mSv, rules, random, difficulty = 'medium', options = {}) {
  const chance = mutationChance(dose_mSv, rules, difficulty, options);
  const haploid = {};
  const flips = [];
  for (const locus of rules.loci) {
    const pair = genotype[locus.id];
    let allele = pair[Math.floor(random() * 2)];
    if (random() < chance) {
      const before = allele;
      allele = flipAllele(allele, locus);
      flips.push({ locus: locus.id, from: before, to: allele });
    }
    haploid[locus.id] = allele;
  }
  return { haploid, flips };
}

export function crossGenotypes(mother, father, doseMother, doseFather, rules, random, difficulty = 'medium', options = {}) {
  const egg = gamete(mother, doseMother, rules, random, difficulty, options);
  const pollen = gamete(father, doseFather, rules, random, difficulty, options);
  const genotype = {};
  for (const locus of rules.loci) {
    genotype[locus.id] = orderPair(egg.haploid[locus.id], pollen.haploid[locus.id]);
  }
  const flips = [...egg.flips, ...pollen.flips];
  return {
    genotype,
    mutation: flips.length
      ? { kind: 'alleleFlip', flips, solarBoosted: Boolean(options.solarActive) }
      : null,
    solarBoosted: Boolean(options.solarActive),
    segregation: { egg: egg.haploid, pollen: pollen.haploid },
  };
}

export function createLineage(state, cropId, rules, extra = {}) {
  const id = `L${state.nextLineageId++}`;
  state.lineages[id] = {
    id,
    cropId,
    generation: 1,
    parentIds: [],
    genotype: wildGenotype(rules),
    log: [],
    ...extra,
  };
  return state.lineages[id];
}

export function lineageForPlant(state, cropId, rules) {
  return state.lineages[state.seedVault[cropId]] ?? createLineage(state, cropId, rules);
}

export function storeCrossChild(state, cropId, motherId, fatherId, result, rules, sol) {
  const id = `L${state.nextLineageId++}`;
  const mother = state.lineages[motherId];
  const generation = Math.max(mother?.generation ?? 1, state.lineages[fatherId]?.generation ?? 1) + 1;
  state.lineages[id] = {
    id,
    cropId,
    generation,
    parentIds: [motherId, fatherId],
    genotype: result.genotype,
    log: [
      ...(mother?.log ?? []),
      {
        sol,
        kind: result.mutation ? 'mutation' : 'cross',
        motherId,
        fatherId,
        genotype: formatGenotype(result.genotype, rules),
        flips: result.mutation?.flips ?? [],
      },
    ],
    mutation: result.mutation,
  };
  state.seedVault[cropId] = id;
  return state.lineages[id];
}

export function dominantStress(stress, rules, dosePerSol) {
  const scores = {
    dose: dosePerSol > 0 ? stress.dose_mSv / dosePerSol : 0,
    cold: stress.coldSols,
    lowPower: stress.lowPowerSols,
    dry: stress.drySols,
    perchlorate: stress.perchlorateSols,
  };
  let bestKey = rules.stressPriority[0];
  let best = -Infinity;
  for (const key of rules.stressPriority) {
    const score = scores[key] ?? 0;
    if (score > best) {
      best = score;
      bestKey = key;
    }
  }
  return { key: bestKey, score: best };
}

export function accumulateStress(crop, plot, ctx) {
  const rules = ctx.data.mutations;
  const dosePerSol = ctx.data.balance.crewRadiationPerSol;
  const bermed = ctx.near(plot, 'berm');
  const active = ctx.state.events.active;
  let dose = dosePerSol;
  if (bermed) dose *= rules.bermDoseFactor;
  if (active.some((event) => event.id === 'spe')) dose *= rules.speDoseMultiplier;
  crop.stress.dose_mSv += dose;
  if (!plot.online) crop.stress.lowPowerSols += 1;
  if (active.some((event) => (event.effects.heatFactor ?? 1) > 1)) crop.stress.coldSols += 1;
  if (!plot.watered) crop.stress.drySols += 1;
  if (!plot.treated) crop.stress.perchlorateSols += 1;
}
