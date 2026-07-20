const fs = require('fs');
const path = require('path');
const config = require('./config');
const { canonPromptBlock } = require('./lib/canon');

function firstExisting(...candidates) {
  for (const p of candidates) {
    if (p && fs.existsSync(p)) return p;
  }
  return null;
}

// On Vercel, __dirname may be a bundled chunk dir — prefer cwd (project root) then walk up.
function resolveBrandFile(...parts) {
  const rel = path.join(...parts);
  return firstExisting(
    path.join(process.cwd(), 'brand', rel),
    path.join(__dirname, 'brand', rel),
    path.join(__dirname, '..', 'brand', rel),
    path.join(__dirname, '..', '..', 'brand', rel),
    path.join(__dirname, '..', '..', '..', 'brand', rel)
  );
}

function resolveLogoRoot() {
  const probe = 'icons/white-no_bg.png';
  const file = resolveBrandFile('logos', ...probe.split('/'));
  if (!file) {
    const tried = [
      path.join(process.cwd(), 'brand', 'logos', probe),
      path.join(__dirname, 'brand', 'logos', probe),
    ];
    throw new Error(
      `Missing brand logo asset: ${probe} (cwd=${process.cwd()}, __dirname=${__dirname}; tried ${tried.join(' | ')})`
    );
  }
  return path.dirname(path.dirname(file)); // .../brand/logos
}

const BRAND_PATH = resolveBrandFile('announce-image.md');
const DNA_PATH = resolveBrandFile('graphify-design-dna.json');
let LOGO_ROOT = null;
function getLogoRoot() {
  if (!LOGO_ROOT) LOGO_ROOT = resolveLogoRoot();
  return LOGO_ROOT;
}

const DNA_QUALITY_CHECKS = `
## Design DNA quality checks (zanwei/design-dna generation guide)
- Every color traces to DNA palette (cream/ink/hero greens/amber/verify — no purple)
- Type: tight grotesque display + mono overlines; not Inter/Roboto personality
- Spacing: macro whitespace; asymmetric balance
- Elevation: no drop shadows — depth from gradient/grain only
- Mood matches DNA: restrained, confident, quietly technical
- Logos: official PNG slots only (never redraw graph-G)
- Effects: lightweight SVG grain/gradient only; no glassmorphism / particle soup
`;

const LOGO_FILES = {
  icon: { white: 'icons/white-no_bg.png', black: 'icons/black-no_bg.png' },
  wordmark: { white: 'wordmark/white-no_bg.png', black: 'wordmark/black-no_bg.png' },
  full: { white: 'full/white-no_bg.png', black: 'full/black-no_bg.png' },
};

function loadBrandDoc() {
  try {
    if (!BRAND_PATH) throw new Error('no brand md');
    return fs.readFileSync(BRAND_PATH, 'utf8');
  } catch {
    return 'Graphify terminal-luxury. Official logos only from brand/logos. Never invent a G mark.';
  }
}

function loadDesignDna() {
  try {
    if (!DNA_PATH) return null;
    return JSON.parse(fs.readFileSync(DNA_PATH, 'utf8'));
  } catch {
    return null;
  }
}

function dnaPromptBlock() {
  const dna = loadDesignDna();
  if (!dna) return '';
  // Compact but complete — full DNA JSON so Claude follows tokens + style + effects.
  return `
## Graphify Design DNA (zanwei/design-dna profile — FOLLOW THIS)
${JSON.stringify(dna, null, 2)}
${DNA_QUALITY_CHECKS}`;
}

function logoTone(treatment) {
  return treatment === 'ink-on-cream' ? 'black' : 'white';
}

// Bundled into the serverless function (Vercel NFT often drops loose PNGs).
let EMBEDDED_LOGOS = null;
function embeddedLogos() {
  if (EMBEDDED_LOGOS) return EMBEDDED_LOGOS;
  try {
    EMBEDDED_LOGOS = require('./brand/logo-assets');
  } catch {
    EMBEDDED_LOGOS = {};
  }
  return EMBEDDED_LOGOS;
}

function readLogoBase64(kind, treatment) {
  const k = LOGO_FILES[kind] ? kind : 'icon';
  const rel = LOGO_FILES[k][logoTone(treatment)];

  const fromBundle = embeddedLogos()[rel];
  if (fromBundle) return fromBundle;

  try {
    const file = path.join(getLogoRoot(), rel);
    if (fs.existsSync(file)) return fs.readFileSync(file).toString('base64');
    const alt = resolveBrandFile('logos', ...rel.split('/'));
    if (alt && fs.existsSync(alt)) return fs.readFileSync(alt).toString('base64');
  } catch {
    /* fall through */
  }
  throw new Error(`Missing brand logo asset: ${rel}`);
}

function logoDataUri(kind, treatment) {
  return `data:image/png;base64,${readLogoBase64(kind, treatment)}`;
}

function defaultLogoLayout(kind, role, w, h) {
  // Premium defaults: corners with breathing room — not tiny junk marks.
  if (role === 'secondary') {
    return {
      x: Math.round(w * 0.08),
      y: Math.round(h * 0.88),
      width: kind === 'wordmark' ? 220 : kind === 'full' ? 280 : 56,
      height: kind === 'wordmark' ? 44 : kind === 'full' ? 64 : 56,
    };
  }
  if (kind === 'full') {
    return { x: Math.round(w * 0.07), y: Math.round(h * 0.07), width: 320, height: 72 };
  }
  if (kind === 'wordmark') {
    return { x: Math.round(w * 0.07), y: Math.round(h * 0.08), width: 240, height: 48 };
  }
  // icon — top-left authority (avoid "AI badge" top-right fake G habit)
  return { x: Math.round(w * 0.07), y: Math.round(h * 0.07), width: 88, height: 88 };
}

function logoImageTag(kind, treatment, layout) {
  const href = logoDataUri(kind, treatment);
  const { x, y, width, height } = layout;
  // href + xlink:href for broader SVG consumers
  return (
    `<image id="graphify-official-${kind}" href="${href}" xlink:href="${href}" ` +
    `x="${x}" y="${y}" width="${width}" height="${height}" ` +
    `preserveAspectRatio="xMidYMid meet"/>`
  );
}

/**
 * Replace logo comment slots with official PNGs. If Claude forgot the markers,
 * append primary (and optional secondary) before </svg>.
 */
function injectOfficialLogos(svg, brief) {
  const treatment = brief.logoTreatment === 'ink-on-cream' ? 'ink-on-cream' : 'white-on-dark';
  const primary = ['icon', 'wordmark', 'full'].includes(brief.logoPrimary)
    ? brief.logoPrimary
    : 'icon';
  const secondary = ['icon', 'wordmark', 'full'].includes(brief.logoSecondary)
    ? brief.logoSecondary
    : null;
  const w = brief.format?.width || 1024;
  const h = brief.format?.height || 1024;

  const primaryLayout = {
    ...defaultLogoLayout(primary, 'primary', w, h),
    ...(brief.logoLayout?.primary || {}),
  };
  const primaryTag = logoImageTag(primary, treatment, primaryLayout);

  let out = svg;

  if (out.includes('<!--GRAPHIFY_LOGO_PRIMARY-->')) {
    out = out.replace(/<!--GRAPHIFY_LOGO_PRIMARY-->/g, primaryTag);
  } else {
    out = out.replace(/<\/svg>\s*$/i, `${primaryTag}\n</svg>`);
  }

  if (secondary && secondary !== primary) {
    const secondaryLayout = {
      ...defaultLogoLayout(secondary, 'secondary', w, h),
      ...(brief.logoLayout?.secondary || {}),
    };
    const secondaryTag = logoImageTag(secondary, treatment, secondaryLayout);
    if (out.includes('<!--GRAPHIFY_LOGO_SECONDARY-->')) {
      out = out.replace(/<!--GRAPHIFY_LOGO_SECONDARY-->/g, secondaryTag);
    } else {
      out = out.replace(/<\/svg>\s*$/i, `${secondaryTag}\n</svg>`);
    }
  } else {
    out = out.replace(/<!--GRAPHIFY_LOGO_SECONDARY-->/g, '');
  }

  // Drop Claude-invented "logo" groups (keep our official <image id="graphify-official-…">).
  out = out.replace(
    /<g[^>]*(?:id|class)=["'][^"']*(?:fake-)?logo[^"']*["'][^>]*>[\s\S]*?<\/g>/gi,
    ''
  );

  // Ensure svg root allows xlink if needed
  if (!/xmlns:xlink=/.test(out)) {
    out = out.replace(
      /<svg\b([^>]*)>/i,
      '<svg$1 xmlns:xlink="http://www.w3.org/1999/xlink">'
    );
  }

  return out;
}

async function callClaude({ system, user, maxTokens = 4000, thinkingBudget = 0, images = [] }) {
  if (!config.anthropicApiKey) throw new Error('ANTHROPIC_API_KEY not set (needed for announcement images)');

  const content = [];
  for (const img of images) {
    content.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: img.mediaType || 'image/png',
        data: img.base64,
      },
    });
  }
  content.push({ type: 'text', text: user });

  const body = {
    model: config.anthropicImageModel || config.anthropicModel,
    max_tokens: maxTokens,
    system,
    messages: [{ role: 'user', content }],
  };

  if (thinkingBudget > 0) {
    body.thinking = { type: 'enabled', budget_tokens: thinkingBudget };
    body.max_tokens = Math.max(maxTokens, thinkingBudget + 2000);
  }

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': config.anthropicApiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    if (thinkingBudget > 0 && (res.status === 400 || res.status === 422)) {
      return callClaude({ system, user, maxTokens, thinkingBudget: 0, images });
    }
    throw new Error(`Anthropic API ${res.status}: ${errText.slice(0, 280)}`);
  }

  const data = await res.json();
  return (data.content || [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();
}

function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1].trim() : text.trim();
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('No JSON art brief in model response');
  return JSON.parse(raw.slice(start, end + 1));
}

function extractSvg(text) {
  const match = text.match(/<svg[\s\S]*?<\/svg>/i);
  if (!match) throw new Error('No SVG in model response');
  return match[0].trim();
}

function officialLogoImages(treatment) {
  // Show Claude the real mark so it stops inventing hexagon-G badges.
  return [
    {
      base64: readLogoBase64('icon', treatment),
      mediaType: 'image/png',
    },
    {
      base64: readLogoBase64('full', treatment),
      mediaType: 'image/png',
    },
  ];
}

async function brainstormBrief(signal, draftText) {
  const brand = loadBrandDoc();
  const system = `You are Graphify Labs' senior brand art director (agency bar, not AI template slop).
Design announcement graphics bound to Graphify terminal-luxury.
You will SEE the official logo PNGs in the user message — memorize them. Never invent a substitute mark.
Output ONLY valid JSON.`;

  const user = `${brand}
${dnaPromptBlock()}

${canonPromptBlock({ signalType: signal.type, forImage: true })}

## Official logo images attached
Image 1 = icon (graph-G wireframe mark). Image 2 = full lockup (mark + wordmark).
These are the ONLY acceptable brand marks. Pick icon | wordmark | full for slots — the server embeds the real PNG files.

Apply DNA priority: color & type first, then spacing/layout, then style mood, then lightweight SVG effects only.
Image headline/subline must obey canon age + neverClaim (no "a year ago", no star-begging copy).

## Announcement signal
Type: ${signal.type}
Title: ${signal.title}
Summary: ${signal.summary}
URL: ${signal.url || '(none)'}
Meta: ${JSON.stringify(signal.meta || {})}

## Discord draft (tone context only)
${(draftText || '').slice(0, 1200)}

## Anti-slop
Avoid dead-center "eyebrow + huge number + thanks + corner fake G". Prefer asymmetric editorial layouts.
Avoid purple, neon glow, uniform faint node wallpaper, junk footnotes like v2025.
One signature moment. Macro whitespace.

Return JSON:
{
  "mood": "why this mood fits",
  "surface": "hero-green|ink-black|cream-paper|terminal",
  "palette": { "background": ["#hex"], "ink": "#hex", "accent": "#hex", "accentRole": "memory|verify|neutral" },
  "format": { "width": 1024, "height": 1024 },
  "layoutArchetype": "editorial-split|asymmetric-number|atmosphere-field",
  "composition": "layout description with approximate positions",
  "dominant": "number|type|atmosphere|terminal — never a redrawn logo",
  "eyebrow": "OPTIONAL mono uppercase ≤24 chars or empty",
  "headline": "≤6 words",
  "subline": "≤14 words",
  "logoTreatment": "white-on-dark|ink-on-cream",
  "logoPrimary": "icon|wordmark|full",
  "logoSecondary": "icon|wordmark|full|null",
  "logoLayout": {
    "primary": { "x": 0, "y": 0, "width": 88, "height": 88 },
    "secondary": { "x": 0, "y": 0, "width": 220, "height": 44 }
  },
  "atmosphere": "brand-color grain/gradient notes",
  "avoid": ["invented logo", "..."],
  "rasterPrompt": "optional 150-220 words if raster ever used — must say use official Graphify wireframe G mark, no invented logos"
}`;

  // Brief against dark-surface logos by default (most announcements are hero-green).
  const text = await callClaude({
    system,
    user,
    maxTokens: 2800,
    thinkingBudget: config.announceImageThinkingBudget,
    images: officialLogoImages('white-on-dark'),
  });
  const brief = extractJson(text);
  if (!brief.logoPrimary) brief.logoPrimary = 'icon';
  if (brief.logoSecondary === 'null' || brief.logoSecondary === '') brief.logoSecondary = null;
  if (!brief.logoTreatment) brief.logoTreatment = 'white-on-dark';
  return brief;
}

async function renderSvg(signal, brief) {
  const brand = loadBrandDoc();
  const w = brief.format?.width || 1024;
  const h = brief.format?.height || 1024;
  const treatment = brief.logoTreatment === 'ink-on-cream' ? 'ink-on-cream' : 'white-on-dark';

  const system = `You generate production-ready SVG announcement posters for Graphify.
Output ONLY a single <svg>...</svg>. No markdown fences.

HARD RULES:
1. NEVER draw a logo, letter G mark, hexagon badge, node-cluster mark, or fake wordmark.
2. Where the official logo must appear, put ONLY these comments (server injects real PNGs):
   <!--GRAPHIFY_LOGO_PRIMARY-->
   <!--GRAPHIFY_LOGO_SECONDARY-->  (only if brief asks for secondary)
3. You may draw background atmosphere, type, hairlines, subtle grain (feTurbulence low opacity).
4. Premium / asymmetric — not a boring centered template.
5. Exact hex colors from the brief. No purple.`;

  const user = `${brand}
${dnaPromptBlock()}

${canonPromptBlock({ signalType: signal.type, forImage: true })}

Signal: ${signal.type} — ${signal.title}

Art brief JSON:
${JSON.stringify(brief, null, 2)}

Requirements:
- viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg"
- Leave logo comment markers at the positions implied by logoLayout (do not draw logos yourself)
- Headline: ${JSON.stringify(brief.headline || '')}
- Subline: ${JSON.stringify(brief.subline || '')}
- Eyebrow: ${JSON.stringify(brief.eyebrow || '')}
- Layout archetype: ${brief.layoutArchetype || 'asymmetric-number'}
- Official logo PNGs are attached only as reference — do not recreate them in paths`;

  const text = await callClaude({
    system,
    user,
    maxTokens: 8000,
    thinkingBudget: 0,
    images: officialLogoImages(treatment),
  });
  return injectOfficialLogos(extractSvg(text), brief);
}

async function renderOpenAI(brief) {
  if (!config.openaiApiKey) return null;

  const prompt = brief.rasterPrompt || brief.composition;
  const size =
    brief.format?.width === 1536 || brief.format?.height === 1024
      ? '1536x1024'
      : '1024x1024';

  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${config.openaiApiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: config.openaiImageModel,
      prompt: String(prompt).slice(0, 32000),
      size,
      n: 1,
      quality: config.openaiImageQuality,
      output_format: 'png',
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`OpenAI Images ${res.status}: ${errText.slice(0, 280)}`);
  }

  const data = await res.json();
  const b64 = data.data?.[0]?.b64_json;
  if (!b64) throw new Error('OpenAI returned no image data');
  return {
    mime: 'image/png',
    base64: b64,
    provider: 'openai',
    model: config.openaiImageModel,
  };
}

async function generateAnnouncementImage(signal, { draftText = '' } = {}) {
  const brief = await brainstormBrief(signal, draftText);
  const engine = config.announceImageEngine;

  let image = null;
  let svg = null;
  let warning = null;

  const wantOpenAI = engine === 'openai' || (engine === 'auto' && config.openaiApiKey);

  if (wantOpenAI) {
    try {
      image = await renderOpenAI(brief);
    } catch (e) {
      warning = e.message;
      if (engine === 'openai') throw e;
    }
  }

  if (engine === 'anthropic' || !image) {
    svg = await renderSvg(signal, brief);
    if (!image) {
      image = {
        mime: 'image/svg+xml',
        base64: Buffer.from(svg, 'utf8').toString('base64'),
        provider: 'anthropic-svg',
        model: config.anthropicImageModel || config.anthropicModel,
      };
    }
  }

  return {
    brief,
    image,
    svg: svg || null,
    engine: image?.provider || 'unknown',
    warning,
  };
}

module.exports = {
  generateAnnouncementImage,
  brainstormBrief,
  renderSvg,
  injectOfficialLogos,
};
