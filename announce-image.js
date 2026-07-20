const fs = require('fs');
const path = require('path');
const config = require('./config');
const { canonPromptBlock } = require('./lib/canon');
const { readLogoBase64, resolveBrandFile } = require('./lib/logo-assets');
const { composePosterSvg } = require('./lib/poster-svg');

const BRAND_PATH = resolveBrandFile('announce-image.md');
const DNA_PATH = resolveBrandFile('graphify-design-dna.json');

const DNA_QUALITY_CHECKS = `
## Design DNA quality checks
- Cream/ink/hero greens/amber only — no purple
- Official logos only (server composes PNG embeds)
- No overlapping type; no body paragraph beside a huge number
`;

function loadBrandDoc() {
  try {
    if (!BRAND_PATH) throw new Error('no brand md');
    return fs.readFileSync(BRAND_PATH, 'utf8');
  } catch {
    return 'Graphify terminal-luxury. Official logos only. Never invent a G mark.';
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
  return `
## Graphify Design DNA (summary)
surface moods: hero-green | ink-black | cream-paper | terminal
accents: amber #c6841c memory, verify #0e9e76 / #3fd7a2 on dark
${DNA_QUALITY_CHECKS}`;
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

function officialLogoImages(treatment) {
  return [
    { base64: readLogoBase64('icon', treatment), mediaType: 'image/png' },
    { base64: readLogoBase64('full', treatment), mediaType: 'image/png' },
  ];
}

/**
 * Claude art-directs copy + mood only. Server owns the SVG layout (no freeform hallucination).
 */
async function brainstormBrief(signal, draftText) {
  const brand = loadBrandDoc();
  const system = `You are Graphify Labs' brand art director.
You pick mood + SHORT on-image copy only. You do NOT draw layouts or logos.
The server renders a fixed non-overlapping poster template with official logo PNGs.
Output ONLY valid JSON.`;

  const user = `${brand}
${dnaPromptBlock()}
${canonPromptBlock({ signalType: signal.type, forImage: true })}

Official logo PNGs are attached for brand recognition only — do not describe inventing a substitute.

Signal type: ${signal.type}
Title: ${signal.title}
Summary: ${signal.summary}
Meta: ${JSON.stringify(signal.meta || {})}
Discord draft (tone only): ${(draftText || '').slice(0, 800)}

HARD COPY RULES FOR THE IMAGE:
- No paragraphs. No overlapping concepts.
- For milestones: displayNumber like "90K", statLine like "92,230 STARS", subline ≤6 words (e.g. "Thank you.").
- Never put a body paragraph next to the big number.
- Obey canon age / neverClaim.

Return JSON:
{
  "mood": "one sentence",
  "surface": "hero-green|ink-black|cream-paper|terminal",
  "layoutArchetype": "asymmetric-number|editorial-split",
  "eyebrow": "GITHUB STARS or short mono label ≤22 chars",
  "displayNumber": "90K or empty if not a number poster",
  "statLine": "92,230 STARS or empty",
  "headline": "≤6 words (editorial only; milestones can leave empty)",
  "subline": "≤6 words",
  "logoTreatment": "white-on-dark|ink-on-cream"
}`;

  const text = await callClaude({
    system,
    user,
    maxTokens: 1200,
    thinkingBudget: Math.min(config.announceImageThinkingBudget || 0, 4000),
    images: officialLogoImages('white-on-dark'),
  });

  const brief = extractJson(text);
  if (!brief.surface) brief.surface = 'hero-green';
  if (!brief.logoTreatment) {
    brief.logoTreatment = brief.surface === 'cream-paper' ? 'ink-on-cream' : 'white-on-dark';
  }
  if (signal.type === 'milestone' && !brief.layoutArchetype) {
    brief.layoutArchetype = 'asymmetric-number';
  }
  // Derive number from meta if Claude omitted
  if (signal.type === 'milestone' && !brief.displayNumber && signal.meta?.milestone) {
    const n = Number(signal.meta.milestone);
    brief.displayNumber = n >= 1000 ? `${Math.round(n / 1000)}K` : String(n);
  }
  if (signal.type === 'milestone' && !brief.statLine && signal.meta?.stars) {
    brief.statLine = `${Number(signal.meta.stars).toLocaleString()} STARS`;
  }
  brief.format = { width: 1024, height: 1024 };
  return brief;
}

function renderSvg(signal, brief) {
  // Deterministic compositor — Claude never authors SVG paths/text boxes.
  return composePosterSvg(signal, brief);
}

async function renderOpenAI(brief) {
  if (!config.openaiApiKey) return null;

  const prompt = brief.rasterPrompt || brief.mood || brief.composition;
  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${config.openaiApiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: config.openaiImageModel,
      prompt: String(prompt).slice(0, 32000),
      size: '1024x1024',
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
    svg = renderSvg(signal, brief);
    if (!image) {
      image = {
        mime: 'image/svg+xml',
        base64: Buffer.from(svg, 'utf8').toString('base64'),
        provider: 'template-svg',
        model: 'poster-svg+claude-brief',
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
  composePosterSvg: renderSvg,
};
