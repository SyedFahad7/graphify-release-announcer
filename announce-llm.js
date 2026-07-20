const config = require('./config');
const { chunkForDiscord } = require('./format');
const {
  loadCanon,
  canonPromptBlock,
  projectAgeLabel,
  validateAnnouncement,
  softDeSlop,
  canonMeta,
} = require('./lib/canon');

function buildSystem() {
  const { facts } = loadCanon();
  return `You write Discord #announcements posts for Graphify Labs (YC ${facts.ycBatch || 'S26'}).
Graphify is an open-source knowledge-graph memory layer for AI coding assistants (PyPI: ${facts.pypiPackage || config.pypiPackage}).

${canonPromptBlock({ signalType: '*' })}

Voice mix (Coolify + Cursor, not Mem0 hype):
- Coolify: warm, honest, founder-like.
- Cursor: short, punchy, no essay.
- Human in the server, not a brand bot.

Format rules:
- Output ONLY the Discord message body. No markdown fences. No preamble.
- Start with a short greeting + ${config.announcePing} when the news is server-wide (milestones, big product).
  For smaller tweet amplifications you may use a lighter open ("hey everyone" or just dive in).
- Use the Graphify custom emoji ${config.releaseEmoji} at most once near the title line.
- Keep under ~1800 characters (one Discord message).
- No em-dash characters. Use commas or periods.
- Do not invent facts, timelines, or download counts. Prefer skipping origin fluff.
- Include a source URL when the signal is the news itself (tweet, release, press/blog article). For milestones, a plain Repo line is optional, not a CTA pitch.`;
}

function userPrompt(signal) {
  const { facts } = loadCanon();
  const age = projectAgeLabel(facts);
  return `Write a ready-to-paste Discord #announcements post for this signal.

Type: ${signal.type}
Title: ${signal.title}
Summary / source text:
${signal.summary}

URL: ${signal.url || '(none)'}
Meta JSON: ${JSON.stringify(signal.meta || {})}

Canon age right now: ${age}. If you mention age, use that — never invent "a year ago".

Channel: #announcements (community main, NOT #production-releases).

Type-specific:
- milestone: celebrate the crossed number + current count if in meta. Thank the community once. No origin myths. No "please star" close. Keep it tight and human.
- tweet: amplify in Discord voice; link the tweet; do not just paste the tweet.
- release: short teaser; point to #production-releases for the full changelog; include release URL.
- news: amplify press/blog/HN coverage in Discord voice; credit the source; link the article; do not invent quotes or metrics not in the summary.
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
      system: buildSystem(),
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
  return softDeSlop(text.replace(/^```(?:discord|md|markdown)?\n?/, '').replace(/\n?```$/, ''));
}

/** @deprecated use validateAnnouncement — kept for scripts/tests */
function humanizeAnnouncement(text, signal) {
  return validateAnnouncement(text, signal).text;
}

function templateDraft(signal) {
  const ping = config.announcePing;
  const emoji = config.releaseEmoji;
  const url = signal.url || '';
  const { facts } = loadCanon();
  const age = projectAgeLabel(facts);

  if (signal.type === 'milestone') {
    const n = signal.meta?.milestone || signal.meta?.stars;
    const stars = signal.meta?.stars;
    return [
      `hey ${ping} ${emoji}`,
      '',
      `**Graphify just crossed ${Number(n).toLocaleString()} GitHub stars.**`,
      '',
      stars && Number(stars) !== Number(n)
        ? `We're at ${Number(stars).toLocaleString()} right now. Still wild for something that was a tiny skill ${age} ago.`
        : `Still wild for an open-source knowledge-graph memory layer that started ${age} ago.`,
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

  if (signal.type === 'news') {
    const host = signal.meta?.host || 'the web';
    return [
      `hey everyone ${emoji}`,
      '',
      `**${signal.title.replace(/^[^:]+:\s*/, '')}**`,
      '',
      signal.summary.slice(0, 280),
      '',
      `Spotted via ${host}${signal.meta?.source ? ` (${signal.meta.source})` : ''}.`,
      url ? `Read: ${url}` : '',
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
 * Returns { text, source, length, chunks, warnings, canon }.
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

  const validated = validateAnnouncement(text, signal);
  text = validated.text;

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
    warnings: validated.warnings,
    canon: canonMeta(),
  };
}

module.exports = {
  draftAnnouncement,
  templateDraft,
  humanizeAnnouncement,
  validateAnnouncement,
};
