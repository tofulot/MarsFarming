// AI-assisted (OpenAI Codex)
const radians = (degrees) => degrees * Math.PI / 180;

export const landingLongitudes = [0, 90, 180, 270];

export function landingCalendarSol(Ls, seasons) {
  if (!landingLongitudes.includes(Ls)) throw new RangeError('Choose a landing season at 0°, 90°, 180°, or 270°.');
  return seasons.months[Ls / 30].solFrom;
}
export function solarLongitude(sol, { months, yearSols }) {
  const yearSol = sol - Math.floor(sol / yearSols) * yearSols;
  const month = months.find(({ solTo }) => yearSol < solTo) ?? months.at(-1);
  return month.LsFrom + (month.LsTo - month.LsFrom)
    * (yearSol - month.solFrom) / (month.solTo - month.solFrom);
}

export function clearSolarFactor(latitude, Ls, orbit) {
  const declination = Math.asin(Math.sin(radians(orbit.obliquityDeg)) * Math.sin(radians(Ls)));
  const noon = Math.max(0, Math.cos(radians(latitude) - declination));
  const near = orbit.perihelionMkm;
  const far = orbit.aphelionMkm;
  const eccentricity = (far - near) / (far + near);
  const distance = near * (1 + eccentricity) /
    (1 + eccentricity * Math.cos(radians(Ls - orbit.perihelionLs)));
  return noon * (((near + far) / 2) / distance) ** 2;
}
