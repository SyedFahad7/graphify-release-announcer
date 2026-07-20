const fs = require('fs');
const path = require('path');
const config = require('./config');
const { deSlop } = require('./parse');
const { chunkForDiscord } = require('./format');

function loadVoiceDoc() {
  try {
    return fs.readFileSync(path.join(__dirname, 'brand', 'announce-voice.md'), 'utf8');
  } catch {
    return '';
  }
}

const SYSTEM = `You write Discord #announcements posts for Graphify Labs (YC S26).
Graphify is an open-source knowledge-graph memory layer for AI coding assistants (PyPI: ${config.pypiPackage}).

${loadVoiceDoc()}

Voice mix (Coolify + Cursor, not Mem0 hype):
- Coolify: warm, honest, founder-like.
- Cursor: short, punchy, no essay.
- Human in the server, not a brand bot.

Rules:
- Output ONLY the Discord message body. No markdown fences. No preamble.
- Start with a short greeting + ${config.announcePing} when the news is server-wide (milestones, big product).
  For smaller tweet amplifications you may use a lighter open ("hey everyone" or just dive in).
- Use the Graphify custom emoji ${config.releaseEmoji} at most once near the title line.
- Keep under ~1800 characters (one Discord message).
- No em-dash characters. Use commas or periods.
- Do not invent facts, timelines, download counts, or "year ago" origin stories.
- First public release was ~April 3, 2026. Project is months old, not a year+. Prefer skipping origin fluff.
- Never hard-sell stars ("drop a star", "if you haven't yet", "keep the momentum"). Quiet repo link OK; asking people to star is not.
- Include a source URL only when it is the news itself (tweet, release). For milestones, a plain Repo line is optional, not a CTA pitch.`;

function userPrompt(signal) {
  return `Write a ready-to-paste Discord #announcements post for this signal.

Type: ${signal.type}
Title: ${signal.title}
Summary / source text:
${signal.summary}

URL: ${signal.url || '(none)'}
Meta JSON: ${JSON.stringify(signal.meta || {})}

Channel: #announcements (community main, NOT #production-releases).

Type-specific:
- milestone: celebrate the crossed number + current count if in meta. Thank the community once. No origin myths. No "please star" close. Keep it tight and human.
- tweet: amplify in Discord voice; link the tweet; do not just paste the tweet.
- release: short teaser; point to #production-releases for the full changelog; include release URL.
- manual: treat summary as the source material. Still no invented timelines or hard-sell CTAs.`;
}

async function callClaude(user) {
  if (!config.anthropicApiKey) throw new Error('ANTHROPIC_API_KEY not set');

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': config.anthropicApiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: config.anthropicModel,
      max_tokens: 1200,
      system: SYSTEM,
      messages: [{ role: 'user', content: user }],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Anthropic API ${res.status}: ${body.slice(0, 200)}`);
  }

  const data = await res.json();
  const text = (data.content || [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();
  return deSlop(text.replace(/^```(?:discord|md|markdown)?\n?/, '').replace(/\n?```$/, ''));
}

/** Soft cleanup if the model still slips into hard-sell / fake timelines. */
function humanizeAnnouncement(text, signal) {
  let t = deSlop(text);

  // Kill common hard-sell closes (keep a plain Repo: line if present earlier).
  t = t.replace(
    /\n*(?:If you haven'?t yet[^.]*\.\s*)?(?:Drop a star|Smash a star|Leave a star|Star the repo)[^\n]*/gi,
    ''
  );
  t = t.replace(/\n*help us keep the momentum[^\n]*/gi, '');
  t = t.replace(/\n*and help us keep[^\n]*/gi, '');

  // Fake long timelines Graphify does not have.
  t = t.replace(/\b[Aa] year ago\b/g, 'A few months ago');
  t = t.replace(/\byears ago\b/gi, 'months ago');
  t = t.replace(/\bfor over a year\b/gi, 'in just a few months');
  t = t.replace(/\bsince last year\b/gi, 'since we launched');

  // Milestone posts: strip trailing "please star" URL pitches but keep optional Repo: lines.
  if (signal?.type === 'milestone') {
    t = t.replace(
      /\n*(?:Star (?:us|the repo|Graphify)[^\n]*\n?)?(?:https:\/\/github\.com\/Graphify-Labs\/graphify\/?\s*)$/i,
      ''
    );
    // If the only URL left is a naked CTA at the end without "Repo:", drop it.
    t = t.replace(/\n+https:\/\/github\.com\/Graphify-Labs\/graphify\/?\s*$/i, '');
  }

  return t.replace(/\n{3,}/g, '\n\n').trim();
}

function templateDraft(signal) {
  const ping = config.announcePing;
  const emoji = config.releaseEmoji;
  const url = signal.url || '';

  if (signal.type === 'milestone') {
    const n = signal.meta?.milestone || signal.meta?.stars;
    const stars = signal.meta?.stars;
    return [
      `hey ${ping} ${emoji}`,
      '',
      `**Graphify just crossed ${Number(n).toLocaleString()} GitHub stars.**`,
      '',
      stars && Number(stars) !== Number(n)
        ? `We're at ${Number(stars).toLocaleString()} right now. Still wild for something that was a tiny skill a few months ago.`
        : `Still wild for an open-source knowledge-graph memory layer that started a few months ago.`,
      '',
      `Thank you for starring, filing issues, opening PRs, and actually using it.`,
      url ? `\nRepo: ${url}` : '',
    ]
      .filter(Boolean)
      .join('\n');
  }

  if (signal.type === 'release') {
    return [
      `hey ${ping}`,
      '',
      `**${signal.title}** ${emoji}`,
      '',
      signal.summary || 'A new Graphify release is live.',
      '',
      `Full Coolify-style changelog is in #production-releases.`,
      url ? `Release notes: ${url}` : '',
    ]
      .filter(Boolean)
      .join('\n');
  }

  if (signal.type === 'tweet') {
    const handle = signal.meta?.handle || 'graphify';
    return [
      `hey everyone`,
      '',
      signal.summary,
      '',
      url ? `Source: ${url}` : `via @${handle}`,
    ]
      .filter(Boolean)
      .join('\n');
  }

  return [
    `hey ${ping}`,
    '',
    `**${signal.title}** ${emoji}`,
    '',
    signal.summary,
    url ? `\n${url}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * Draft a Discord #announcements post for one signal.
 * Returns { text, source, length, chunks }.
 */
async function draftAnnouncement(signal, { noLlm = false } = {}) {
  let text;
  let source = 'template';

  if (!noLlm && config.anthropicApiKey) {
    try {
      text = await callClaude(userPrompt(signal));
      if (text && text.length > 40) source = 'llm';
      else text = templateDraft(signal);
    } catch {
      text = templateDraft(signal);
    }
  } else {
    text = templateDraft(signal);
  }

  text = humanizeAnnouncement(text, signal);
  const budget = config.fitLimit > 0 ? Math.min(config.fitLimit, 1990) : 1990;
  if (text.length > budget) {
    text = `${text.slice(0, budget - 20).trim()}…`;
  }
  const chunks = chunkForDiscord(text, budget);
  return {
    text,
    source,
    length: text.length,
    chunks: chunks.length > 1 ? chunks : null,
  };
}

module.exports = { draftAnnouncement, templateDraft, humanizeAnnouncement };
