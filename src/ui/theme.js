// AI-assisted (Claude): shared design tokens for DOM and Phaser UI. Import from here; don't redefine.
// Fonts are bundled from @fontsource (imported in src/main.js) and awaited in BootScene.
// Display face: titles, tab labels, stat labels, panel headings, achievement names. Never under 20 px.
export const fontDisplay = "'Amatic SC', 'Patrick Hand', system-ui, sans-serif";
// Body face: everything else, and every number. Never under 15 px. No tabular figures, so give
// changing numbers a fixed-width box.
export const fontBody = "'Patrick Hand', system-ui, sans-serif";

export const theme = Object.freeze({
  panel: '#231615', raised: '#3a2623', sunken: '#1b1110', border: '#6e4b42', divider: '#4a3330',
  ink: '#f5e9e2', muted: '#c9b3a8', accent: '#f0886a', amber: '#ffb05a', mint: '#9bd8ae', danger: '#ff9a8a',
  radiusPanel: '10px', radiusButton: '6px',
  displayTracking: '0.06em', displayMinPx: 20, bodyMinPx: 15,
});

/** Font faces BootScene waits for before the first Phaser text is measured. */
export const fontFaces = Object.freeze(["700 24px 'Amatic SC'", "400 24px 'Amatic SC'", "400 18px 'Patrick Hand'"]);
