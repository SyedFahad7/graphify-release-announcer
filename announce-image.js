const fs = require('fs');
const path = require('path');
const config = require('./config');

const BRAND_PATH = path.join(__dirname, 'brand', 'announce-image.md');

function loadBrandDoc() {
  try {
    return fs.readFileSync(BRAND_PATH, 'utf8');
  } catch {
    return 'Graphify terminal-luxury: cream #f8f7f0, ink #16211b, hero greens, amber #c6841c, verify #0e9e76. Graph-G wireframe logo.';
  }
}

async function callClaude({ system, user, maxTokens = 4000, thinkingBudget = 0 }) {
  if (!config.anthropicApiKey) throw new Error('ANTHROPIC_API_KEY not set (needed for announcement images)');

  const body = {
    model: config.anthropicImageModel || config.anthropicModel,
    max_tokens: maxTokens,
    system,
    messages: [{ role: 'user', content: user }],
  };

  // Extended thinking when budget > 0 (Sonnet/Opus). Fail open if API rejects.
  if (thinkingBudget > 0) {
    body.thinking = { type: 'enabled', budget_tokens: thinkingBudget };
    // Anthropic requires max_tokens > thinking budget
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
    // Retry without thinking if unsupported
    if (thinkingBudget > 0 && (res.status === 400 || res.status === 422)) {
      return callClaude({ system, user, maxTokens, thinkingBudget: 0 });
    }
    throw new Error(`Anthropic API ${res.status}: ${errText.slice(0, 280)}`);
  }

  const data = await res.json();
  const text = (data.content || [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();
  return text;
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

/**
 * Step 1 — hard brainstorm: mood, palette, composition, copy-on-image.
 */
async function brainstormBrief(signal, draftText) {
  const brand = loadBrandDoc();
  const system = `You are Graphify Labs' senior brand art director. You design announcement graphics
that feel bound to Graphify (terminal-luxury), never generic AI purple or another company's theme.

Read the brand doc carefully. Think deeply about the right mood for THIS announcement before deciding.
Output ONLY valid JSON (no markdown outside JSON).`;

  const user = `${brand}

## Announcement signal
Type: ${signal.type}
Title: ${signal.title}
Summary: ${signal.summary}
URL: ${signal.url || '(none)'}
Meta: ${JSON.stringify(signal.meta || {})}

## Discord draft (context for tone; do not paste into the image)
${(draftText || '').slice(0, 1200)}

Return JSON with this shape:
{
  "mood": "one sentence why this mood fits",
  "surface": "hero-green|ink-black|cream-paper|terminal",
  "palette": { "background": ["#hex", "..."], "ink": "#hex", "accent": "#hex", "accentRole": "memory|verify|neutral" },
  "format": { "width": 1024, "height": 1024 },
  "composition": "layout description",
  "dominant": "what owns the frame (number|graph-G|wordmark|terminal)",
  "eyebrow": "OPTIONAL mono uppercase ≤24 chars or empty",
  "headline": "≤6 words",
  "subline": "≤14 words",
  "logoTreatment": "white-on-dark|ink-on-cream",
  "atmosphere": "grain/gradient/wireframe notes in brand colors",
  "avoid": ["..."],
  "rasterPrompt": "150-220 word English prompt for a diffusion model: photoreal/graphic poster, include exact hex colors, graph-G description, NO other brand logos, NO purple"
}`;

  const text = await callClaude({
    system,
    user,
    maxTokens: 2500,
    thinkingBudget: config.announceImageThinkingBudget,
  });
  return extractJson(text);
}

/**
 * Step 2 — Claude authors production SVG (Anthropic path; Discord-friendly download).
 */
async function renderSvg(signal, brief) {
  const brand = loadBrandDoc();
  const w = brief.format?.width || 1024;
  const h = brief.format?.height || 1024;

  const system = `You generate production-ready SVG announcement posters for Graphify.
Output ONLY a single <svg>...</svg> document. No markdown fences, no commentary.
Use exact hex colors from the brief. Embed the graph-G as geometric paths/circles (nodes+edges forming G).
Typography: system-ui / sans-serif is fine (Bricolage may not load). Tight tracking on headlines.
Fine noise can be a subtle feTurbulence filter at low opacity. No external images or fonts URLs that break offline.`;

  const user = `${brand}

Signal: ${signal.type} — ${signal.title}

Art brief JSON:
${JSON.stringify(brief, null, 2)}

Requirements:
- viewBox="0 0 ${w} ${h}" width="${w}" height="${h}"
- Include Graphify wordmark text + stylized graph-G mark
- Headline: ${JSON.stringify(brief.headline || '')}
- Subline: ${JSON.stringify(brief.subline || '')}
- Eyebrow: ${JSON.stringify(brief.eyebrow || '')}
- Looks premium at Discord size; not sparse empty void, not cluttered
- No purple. No Inter-looking generic blue SaaS.`;

  const text = await callClaude({
    system,
    user,
    maxTokens: 8000,
    thinkingBudget: 0,
  });
  return extractSvg(text);
}

/**
 * Optional raster via OpenAI Images API (Anthropic cannot emit PNG).
 */
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

/**
 * Full pipeline for Discord Studio checkbox.
 * Returns { brief, image, svg?, engine, warning? }
 */
async function generateAnnouncementImage(signal, { draftText = '' } = {}) {
  const brief = await brainstormBrief(signal, draftText);
  const engine = config.announceImageEngine; // anthropic | openai | auto

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

  // Anthropic path: always SVG when engine=anthropic, or as fallback when no raster.
  // (Claude cannot emit PNG; SVG is the on-brand vector poster.)
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
};
