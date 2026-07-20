/**
 * Deterministic Graphify announcement posters.
 * Claude only supplies a brief (copy + mood); this module owns layout so
 * freeform SVG cannot hallucinate overlapping text or fake logos.
 */

const { logoDataUri } = require('./logo-assets');

function escapeXml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

const SURFACES = {
  'hero-green': {
    bg0: '#062a22',
    bg1: '#0a3f31',
    bg2: '#1e6149',
    ink: '#f8f7f0',
    muted: '#a8c9ad',
    accent: '#c6841c',
    treatment: 'white-on-dark',
  },
  'ink-black': {
    bg0: '#052019',
    bg1: '#0a1814',
    bg2: '#16211b',
    ink: '#f8f7f0',
    muted: '#8aa396',
    accent: '#3fd7a2',
    treatment: 'white-on-dark',
  },
  'cream-paper': {
    bg0: '#f8f7f0',
    bg1: '#edeee2',
    bg2: '#e0e2d3',
    ink: '#16211b',
    muted: '#626b60',
    accent: '#c6841c',
    treatment: 'ink-on-cream',
  },
  terminal: {
    bg0: '#041612',
    bg1: '#062a22',
    bg2: '#0a3f31',
    ink: '#f8f7f0',
    muted: '#3fd7a2',
    accent: '#c6841c',
    treatment: 'white-on-dark',
  },
};

function pickSurface(brief) {
  return SURFACES[brief.surface] || SURFACES['hero-green'];
}

function short(s, max) {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1).trim()}…`;
}

function imageTag(id, kind, treatment, x, y, w, h) {
  const href = logoDataUri(kind, treatment);
  return (
    `<image id="${id}" href="${href}" xlink:href="${href}" ` +
    `x="${x}" y="${y}" width="${w}" height="${h}" ` +
    `preserveAspectRatio="xMidYMid meet"/>`
  );
}

function grainFilter() {
  return `<filter id="grain" x="0%" y="0%" width="100%" height="100%">
  <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" stitchTiles="stitch" result="n"/>
  <feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.05 0" in="n"/>
</filter>`;
}

/**
 * Milestone / big-number poster — fixed non-overlapping zones:
 * top: logo + eyebrow | mid-left: number | under number: stat + one line | footer: site + full lockup
 * NO paragraph body beside the number (that was the hallucination failure mode).
 */
function composeNumberPoster(signal, brief) {
  const w = 1024;
  const h = 1024;
  const s = pickSurface(brief);
  const treatment = s.treatment;

  const milestone = signal.meta?.milestone || signal.meta?.stars;
  const stars = signal.meta?.stars;
  const display =
    short(brief.displayNumber, 8) ||
    (milestone ? `${Math.round(Number(milestone) / 1000)}K` : '★');
  const eyebrow = short(brief.eyebrow || 'GITHUB STARS', 22).toUpperCase();
  const statLine = short(
    brief.statLine ||
      (stars ? `${Number(stars).toLocaleString()} STARS` : ''),
    28
  ).toUpperCase();
  // One short line only — never a paragraph
  const subline = short(brief.subline || brief.headline || 'Thank you.', 42);
  const site = 'graphify.com';

  const logoIcon = imageTag('logo-icon', 'icon', treatment, 72, 64, 80, 80);
  const logoFull = imageTag('logo-full', 'full', treatment, 560, 900, 380, 72);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
  width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0.35" y2="1">
      <stop offset="0%" stop-color="${s.bg0}"/>
      <stop offset="55%" stop-color="${s.bg1}"/>
      <stop offset="100%" stop-color="${s.bg2}"/>
    </linearGradient>
    ${grainFilter()}
  </defs>
  <rect width="${w}" height="${h}" fill="url(#bg)"/>
  <rect width="${w}" height="${h}" filter="url(#grain)" opacity="0.55"/>

  <!-- Zone: brand mark (top-left) — official PNG only -->
  ${logoIcon}

  <!-- Zone: eyebrow (top, right of mark) -->
  <text x="180" y="112" fill="${s.accent}" font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
    font-size="18" font-weight="500" letter-spacing="0.22em">${escapeXml(eyebrow)}</text>

  <!-- Zone: hero number — owns left/center; nothing else in this box -->
  <text x="72" y="520" fill="${s.ink}" font-family="system-ui, -apple-system, Segoe UI, sans-serif"
    font-size="220" font-weight="700" letter-spacing="-0.06em">${escapeXml(display)}</text>

  <!-- Zone: under-number stack (clear of the numeral) -->
  <line x1="72" y1="560" x2="420" y2="560" stroke="${s.ink}" stroke-opacity="0.35" stroke-width="2"/>
  ${
    statLine
      ? `<text x="72" y="610" fill="${s.accent}" font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
    font-size="22" font-weight="600" letter-spacing="0.14em">${escapeXml(statLine)}</text>`
      : ''
  }
  <text x="72" y="${statLine ? 660 : 620}" fill="${s.ink}" fill-opacity="0.88"
    font-family="system-ui, -apple-system, Segoe UI, sans-serif" font-size="28" font-weight="500">${escapeXml(subline)}</text>

  <!-- Zone: footer -->
  <line x1="72" y1="860" x2="952" y2="860" stroke="${s.ink}" stroke-opacity="0.2" stroke-width="1"/>
  <text x="72" y="920" fill="${s.muted}" font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
    font-size="20" letter-spacing="0.06em">${escapeXml(site)}</text>
  ${logoFull}
</svg>`;
}

function composeEditorialPoster(signal, brief) {
  const w = 1024;
  const h = 1024;
  const s = pickSurface(brief);
  const treatment = s.treatment;
  const eyebrow = short(brief.eyebrow || 'ANNOUNCEMENT', 22).toUpperCase();
  const headline = short(brief.headline || signal.title || 'Graphify', 36);
  const subline = short(brief.subline || '', 56);
  const logoFull = imageTag('logo-full', 'full', treatment, 72, 72, 340, 70);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
  width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${s.bg0}"/>
      <stop offset="100%" stop-color="${s.bg2}"/>
    </linearGradient>
    ${grainFilter()}
  </defs>
  <rect width="${w}" height="${h}" fill="url(#bg)"/>
  <rect width="${w}" height="${h}" filter="url(#grain)" opacity="0.45"/>
  ${logoFull}
  <text x="72" y="220" fill="${s.accent}" font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
    font-size="16" letter-spacing="0.2em">${escapeXml(eyebrow)}</text>
  <text x="72" y="420" fill="${s.ink}" font-family="system-ui, -apple-system, Segoe UI, sans-serif"
    font-size="64" font-weight="700" letter-spacing="-0.03em">${escapeXml(headline)}</text>
  ${
    subline
      ? `<text x="72" y="500" fill="${s.muted}" font-family="system-ui, -apple-system, Segoe UI, sans-serif"
    font-size="26">${escapeXml(subline)}</text>`
      : ''
  }
  <text x="72" y="940" fill="${s.muted}" font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
    font-size="18">graphify.com</text>
</svg>`;
}

/**
 * Build poster SVG from brief — never freeform-modelled paths for logos/type collision.
 */
function composePosterSvg(signal, brief) {
  const archetype = brief.layoutArchetype || '';
  const isMilestone =
    signal.type === 'milestone' ||
    archetype === 'asymmetric-number' ||
    Boolean(brief.displayNumber) ||
    Boolean(signal.meta?.milestone);

  if (isMilestone) return composeNumberPoster(signal, brief);
  return composeEditorialPoster(signal, brief);
}

module.exports = {
  composePosterSvg,
  escapeXml,
  SURFACES,
};
