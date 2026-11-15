import { solarLongitude } from '../sim/insolation.js';
import { mulberry32 } from '../sim/rng.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const wrap = (value, period) => ((value % period) + period) % period;
const mix = (a, b, fraction) => a + (b - a) * fraction;

function seedNumber(seed) {
  if (typeof seed === 'number') return seed >>> 0;
  let hash = 2166136261;
  for (const char of seed) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return hash >>> 0;
}

function describeConditions(conditions, dustOpticalDepth) {
  if (conditions.storm) return archivedStormNames[conditions.storm];
  if (conditions.snow) return conditions.snow === 'co2' ? 'Dry-ice snow' : 'Water-ice snow';
  if (conditions.cold) return 'Severe cold';
  if (conditions.fog) return 'Ice fog';
  if (conditions.dustDevil) return 'Dust devil';
  if (conditions.windy) return 'Windy';
  if (conditions.haze && dustOpticalDepth >= 0.4) return 'Dust haze';
  if (conditions.waterIceCloud || conditions.co2Cloud) return 'Ice clouds';
  return conditions.haze ? 'Dust haze' : 'Clear';
}

const stormTypes = [null, 'dustLocal', 'dustRegional', 'dustGlobal'];
export const archivedStormNames = {
  dustLocal: 'Local dust storm', dustRegional: 'Regional dust storm', dustGlobal: 'Global dust storm',
};

const tuning = {
  easy: { solarFloor: 0.75, extinction: 0.22, habitatHeatW: 120, drillLoss: 0.1, fouling: 3 },
  medium: { solarFloor: 0.55, extinction: 0.36, habitatHeatW: 240, drillLoss: 0.2, fouling: 5 },
  hard: { solarFloor: 0.25, extinction: 0.55, habitatHeatW: 420, drillLoss: 0.3, fouling: 7 },
};

function gridPoint({ columns, rows, west, south, step }, { lat, lon = 0 }) {
  const x = wrap(lon - west, 360) / step;
  const y = clamp((lat - south) / step, 0, rows - 1);
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = (x0 + 1) % columns;
  const y1 = Math.min(y0 + 1, rows - 1);
  const nearest = Math.round(y) * columns + Math.round(x) % columns;
  return { nearest, sample: (values, offset) => mix(
    mix(values[offset + y0 * columns + x0], values[offset + y0 * columns + x1], x - x0),
    mix(values[offset + y1 * columns + x0], values[offset + y1 * columns + x1], x - x0), y - y0,
  ) };
}

function nextFrame(angles, angle) {
  let low = 0;
  let high = angles.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (angles[middle] <= angle) low = middle + 1;
    else high = middle;
  }
  return low;
}

function nearestFrame(angles, angle) {
  const next = nextFrame(angles, angle);
  const previous = Math.max(0, next - 1);
  const following = Math.min(angles.length - 1, next);
  return angle - angles[previous] <= angles[following] - angle ? previous : following;
}

// The payload is produced by scripts/prepare-mars-weather.py. Gzip is transport only.
export function readWeatherArchive(manifest, bytes) {
  if (manifest?.version !== 1 || bytes.byteLength !== manifest.byteLength) {
    throw new Error('Invalid Mars weather archive version or length');
  }
  const data = new DataView(bytes);
  function read({ offset, length, type }) {
    const width = type === 'u8' ? 1 : 2;
    if (!['u8', 'u16', 'i16'].includes(type) || !Number.isInteger(offset) || offset < 0 ||
        !Number.isInteger(length) || length < 1 || offset + length * width > bytes.byteLength) {
      throw new Error('Invalid Mars weather archive field');
    }
    if (type === 'u8') return new Uint8Array(bytes, offset, length);
    const values = type === 'i16' ? new Int16Array(length) : new Uint16Array(length);
    for (let i = 0; i < length; i++) values[i] = type === 'i16'
      ? data.getInt16(offset + i * width, true) : data.getUint16(offset + i * width, true);
    return values;
  }

  const { dust, met, cloud } = manifest;
  const cells = (grid) => grid.columns * grid.rows;
  const years = dust.years.map(({ year, angles, opacity, storm }) => ({
    year, angles: read(angles), opacity: read(opacity), storm: read(storm),
  }));
  if (years.length !== 12 || years.some(({ year, angles, opacity, storm }, index) => year !== 25 + index ||
      angles.length * cells(dust.grid) !== opacity.length || storm.length !== opacity.length ||
      angles.some((angle, i) => angle >= 36000 || (i > 0 && angle <= angles[i - 1])))) {
    throw new Error('Invalid Mars dust years');
  }
  function gridSection(section) {
    const angles = read(section.angles);
    const fields = Object.entries(section.fields).map(([key, field]) => [key, read(field), field.scale]);
    if (fields.some(([, values, scale]) => values.length !== angles.length * cells(section.grid) ||
        !Number.isFinite(scale) || scale <= 0)) throw new Error('Invalid Mars seasonal weather fields');
    return { ...section, angles, fields };
  }
  const meteorology = gridSection(met);
  const iceClouds = gridSection(cloud);

  function weatherProfile({ grid, angles, fields, sampling }, site) {
    const point = gridPoint(grid, site);
    const size = cells(grid);
    return (Ls) => {
      const angle = Ls * 100;
      if (sampling === 'daily') {
        const frame = nearestFrame(angles, angle);
        return Object.fromEntries(fields.map(([key, values, scale]) => [key, scale * point.sample(values, frame * size)]));
      }
      const next = nextFrame(angles, angle);
      const lo = wrap(next - 1, angles.length);
      const hi = next % angles.length;
      const interval = wrap(angles[hi] - angles[lo], 36000);
      const fraction = interval ? wrap(angle - angles[lo], 36000) / interval : 0;
      return Object.fromEntries(fields.map(([key, values, scale]) => [key, scale * mix(
        point.sample(values, lo * size), point.sample(values, hi * size), fraction,
      )]));
    };
  }

  function dustProfile(site) {
    const point = gridPoint(dust.grid, site);
    const size = cells(dust.grid);
    return (yearIndex, Ls) => {
      const { year, angles, opacity, storm } = years[wrap(yearIndex, years.length)];
      const frame = nearestFrame(angles, Ls * 100);
      return { archiveYear: year, dustOpticalDepth: point.sample(opacity, frame * size) * dust.scale * 2.6,
        storm: stormTypes[storm[frame * size + point.nearest]] };
    };
  }

  return Object.freeze({
    dustProfile, yearCount: years.length,
    meteorology: (site) => weatherProfile(meteorology, site),
    iceClouds: (site) => weatherProfile(iceClouds, site),
  });
}

export async function decompressWeatherArchive(bytes) {
  if (!(bytes instanceof ArrayBuffer)) throw new Error('Missing Mars weather archive');
  const header = new Uint8Array(bytes, 0, Math.min(bytes.byteLength, 2));
  // A server can serve the file with Content-Encoding: gzip, which the browser decodes.
  if (header[0] !== 0x1f || header[1] !== 0x8b) return bytes;
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).arrayBuffer();
}

export function createArchiveProvider(archive, seasons) {
  let profile;
  function location(site) {
    if (profile?.lat === site.lat && profile?.lon === site.lon) return profile;
    profile = { lat: site.lat, lon: site.lon, dustAt: archive.dustProfile(site),
      metAt: archive.meteorology(site), cloudAt: archive.iceClouds(site), storms: new Map() };
    return profile;
  }

  return ({ site, Ls, sol, calendarSol = sol, seed = 42, difficulty }) => {
    const { dustAt, metAt, cloudAt, storms } = location(site);
    const numericSeed = seedNumber(seed);
    const year = Math.floor(mulberry32(numericSeed)() * archive.yearCount);
    const calendarStart = calendarSol - sol;
    const dustFor = (day, angle) => dustAt(year + Math.floor((calendarStart + day + 1e-8) / seasons.yearSols), angle);
    const dust = dustFor(sol, Ls);
    const met = metAt(Ls);
    const { pressurePa, windEastMs, windNorthMs, windSpeedMs, windPeakMs = windSpeedMs, surfaceCo2 } = met;
    const { cloudOpticalDepth } = cloudAt(Ls);
    const random = mulberry32(numericSeed ^ Math.imul(sol, 0x85ebca6b) ^ Math.round(site.lat * 1000));
    const thermalNoise = (block) => mulberry32(numericSeed ^ Math.imul(block, 0x9e3779b1))() * 2 - 1;
    const block = Math.floor(sol / 3);
    const anomaly = met.airVariationC === undefined ? 0
      : mix(thermalNoise(block), thermalNoise(block + 1), (sol % 3) / 3) * met.airVariationC;
    const airMinC = met.airMinC + anomaly;
    const airMaxC = met.airMaxC + anomaly;
    const airMeanC = met.airMeanC + anomaly;
    const groundMinC = met.groundMinC + anomaly;
    const hemisphereLs = wrap(Ls + (site.lat < 0 ? 180 : 0), 360);
    const polarWinter = Math.abs(site.lat) >= 65 && hemisphereLs >= 210 && hemisphereLs < 335;
    const coldLoad = clamp((-55 - airMeanC) / 40, 0, 1);
    const waterIceCloud = cloudOpticalDepth >= 0.09;
    const surfaceFrost = surfaceCo2 > 0.1 ? 'co2' : null;
    const overnightFrost = groundMinC < -128 ? 'co2'
      : !surfaceFrost && waterIceCloud && groundMinC < -82 ? 'water' : null;
    const waterFrost = overnightFrost === 'water';
    const dustDevil = !dust.storm && airMaxC - airMinC > 30 && windSpeedMs < 15 && random() < 0.12;
    const conditions = {
      storm: dust.storm, haze: dust.dustOpticalDepth >= 0.24, windy: windSpeedMs >= 9 || windPeakMs >= 14,
      cold: coldLoad >= 0.45, waterIceCloud, co2Cloud: (polarWinter || Math.abs(site.lat) < 20 && Ls >= 45 && Ls <= 135)
        && random() < 0.15,
      fog: waterFrost && windSpeedMs < 5 && random() < 0.25,
      frost: surfaceFrost ?? overnightFrost,
      surfaceFrost, overnightFrost,
      snow: (surfaceFrost || overnightFrost === 'co2') && polarWinter && site.lat < 0 && random() < 0.15 ? 'co2'
        : site.lat >= 60 && Ls >= 110 && Ls < 150 && waterIceCloud && random() < 0.22 ? 'water' : null,
      dustDevil, dustSparks: Boolean(dustDevil || dust.storm) && random() < 0.055,
    };
    const mode = tuning[difficulty] ?? tuning.medium;
    const cloudLoss = clamp(cloudOpticalDepth * 0.09, 0, 0.05);
    const excessDust = Math.max(0, dust.dustOpticalDepth - 0.25);
    const dustFactor = Math.exp(-excessDust * mode.extinction);
    const atmosphereFactor = Math.max(mode.solarFloor, dustFactor * (1 - cloudLoss));
    const events = [];
    if (dust.storm) {
      const key = `${year}:${calendarStart.toFixed(6)}:${sol}`;
      let event = storms.get(key);
      if (!event) {
        const at = (day) => dustFor(day, solarLongitude(calendarStart + day, seasons)).storm;
        let startSol = sol;
        let endSol = sol + 1;
        while (startSol > 0 && at(startSol - 1) === dust.storm) startSol--;
        while (endSol - startSol < 669 && at(endSol) === dust.storm) endSol++;
        event = { id: dust.storm, name: archivedStormNames[dust.storm], startSol, endSol, archive: true };
        for (let day = startSol; day < endSol; day++) storms.set(`${year}:${calendarStart.toFixed(6)}:${day}`, event);
      }
      events.push({ ...event, effects: { solarFactor: atmosphereFactor, heatingFactor: 1, commsFactor: 1 } });
    }
    if (conditions.cold) events.push({ id: 'coldSnap', name: 'Severe cold', startSol: sol, endSol: sol + 1,
      archive: true, effects: { solarFactor: 1, heatingFactor: 1, commsFactor: 1 } });
    return {
      ...dust, conditions, primary: describeConditions(conditions, dust.dustOpticalDepth),
      cloudOpticalDepth, airMinC, airMaxC, outsideTempC: airMeanC,
      temperatureBasis: 'OpenMARS near-surface reanalysis', pressurePa, windEastMs, windNorthMs, windSpeedMs, windPeakMs,
      atmosphereFactor, dustFactor: Math.max(mode.solarFloor, dustFactor),
      panelDustMultiplier: 1 + Math.min(mode.fouling, excessDust * 1.8),
      habitatHeatW: mode.habitatHeatW * coldLoad, iceDrillFactor: 1 - mode.drillLoss * coldLoad, events,
    };
  };
}

export function landingWeatherOutlook(archive, site, startSol, seasons, duration) {
  const dustAt = archive.dustProfile(site);
  const metAt = archive.meteorology(site);
  let stormDays = 0;
  let minimumC = Infinity;
  for (let day = 0; day < duration; day++) {
    const calendarSol = startSol + day;
    const Ls = solarLongitude(calendarSol, seasons);
    minimumC = Math.min(minimumC, metAt(Ls).airMinC);
    for (let year = 0; year < archive.yearCount; year++) {
      if (dustAt(year + Math.floor(calendarSol / seasons.yearSols), Ls).storm) stormDays++;
    }
  }
  return { stormSols: stormDays / archive.yearCount, minimumC };
}
