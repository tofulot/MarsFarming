// AI-assisted (Cursor)
const haversineKm = (a, b) => {
  const toRad = (deg) => deg * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
};

export function soilProfileMap(soils) {
  return new Map((soils?.profiles ?? []).map((profile) => [profile.id, profile]));
}

export function resolveSoilProfile(site, data) {
  const soils = data.soils;
  if (!soils?.profiles?.length) return null;
  const byId = soilProfileMap(soils);
  if (site.soilProfileId && byId.has(site.soilProfileId)) return byId.get(site.soilProfileId);
  const named = (data.sites ?? []).filter((entry) => entry.soilProfileId && byId.has(entry.soilProfileId));
  if (!named.length || !Number.isFinite(site.lat) || !Number.isFinite(site.lon)) {
    return soils.profiles[0];
  }
  let best = named[0];
  let bestKm = Infinity;
  for (const entry of named) {
    const km = haversineKm(site, entry);
    if (km < bestKm) {
      best = entry;
      bestKm = km;
    }
  }
  return byId.get(best.soilProfileId) ?? soils.profiles[0];
}

export function createPlotSoil(site, data, { treated = false } = {}) {
  const profile = resolveSoilProfile(site, data);
  if (!profile) {
    return { profileId: null, perchlorate_wt_pct: treated ? 0 : 0.4, pH: 7.5, fertility: treated ? 0.7 : 0.4 };
  }
  const soils = data.soils;
  const perchlorate = treated ? soils.washerResidual_wt_pct : profile.perchlorate_wt_pct;
  const fertility = treated ? Math.min(1, profile.fertility + 0.25) : profile.fertility;
  return {
    profileId: profile.id,
    name: profile.name,
    analog: profile.analog,
    perchlorate_wt_pct: perchlorate,
    pH: profile.pH,
    fertility,
    _src: profile._src,
  };
}

export function isSoilSafe(soil, soils) {
  if (!soil) return false;
  const limit = soils?.safePerchlorate_wt_pct ?? 0.05;
  return soil.perchlorate_wt_pct <= limit;
}

export function washPlotSoil(plot, soils) {
  if (!plot.soil) {
    plot.treated = true;
    return;
  }
  plot.soil.perchlorate_wt_pct = soils.washerResidual_wt_pct;
  plot.soil.fertility = Math.min(1, plot.soil.fertility + (soils.washerFertilityBump ?? 0.12));
  plot.treated = isSoilSafe(plot.soil, soils);
}

export function fertilizeAdjacentPlots({ state, near, data }) {
  const soils = data.soils;
  if (!soils) return;
  const step = soils.fertilizerFertilityPerSol ?? 0.08;
  for (const plot of state.buildings) {
    if (plot.id !== 'plot' || !plot.soil) continue;
    const fed = near(plot, 'fertilizer', (building) => building.online && building.watered);
    if (!fed) continue;
    plot.soil.fertility = Math.min(1, plot.soil.fertility + step);
  }
}

export function soilYieldMultiplier(plot, data, fertilized) {
  const soils = data.soils;
  const fertility = plot.soil?.fertility ?? 0.7;
  if (!soils) return fertilized ? (data.balance.fertilizerYield ?? 1.2) : 1;
  const min = soils.fertilityYieldMin ?? 0.8;
  const max = soils.fertilityYieldMax ?? 1.05;
  const fromFertility = min + (max - min) * Math.min(1, Math.max(0, fertility));
  const boost = fertilized ? (data.balance.fertilizerYield ?? 1.2) : 1;
  return fromFertility * boost;
}

export function soilStatusLine(plot, data) {
  const soil = plot.soil;
  if (!soil) return plot.treated ? 'Treated soil' : 'Untreated soil';
  const profile = soilProfileMap(data.soils).get(soil.profileId);
  const label = soil.analog ?? profile?.analog ?? soil.name ?? 'Martian regolith';
  const salt = `${soil.perchlorate_wt_pct.toFixed(2)} wt% ClO₄⁻`;
  const fert = `${Math.round(soil.fertility * 100)}% fertility`;
  const state = plot.treated ? 'washed' : 'toxic';
  return `${label} · ${salt} · pH ${soil.pH} · ${fert} · ${state}`;
}
