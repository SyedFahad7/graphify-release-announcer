const config = require('./config');
const { deSlop } = require('./parse');
const { chunkForDiscord } = require('./format');

const SYSTEM = `You write Discord #announcements posts for Graphify Labs (YC S26).
Graphify is an open-source knowledge-graph memory layer for AI coding assistants (PyPI: ${config.pypiPackage}).

Voice mix (learn from Coolify + Cursor, not Mem0 hype):
- Coolify: warm, honest, founder-like, clear why it matters, one CTA.
- Cursor: short, punchy, links up front, no essay.
- Avoid: "thrilled", "supercharge", "bundle of fresh", "excited to announce", em-dash "—".

Rules:
- Output ONLY the Discord message body. No markdown fences around the whole post. No preamble.
- Start with a short greeting + ${config.announcePing} when the news is server-wide (milestones, big product).
  For smaller tweet amplifications you may use a lighter open ("hey everyone" or just dive in).
- Use the Graphify custom emoji ${config.releaseEmoji} at most once near the title line.
- Keep under ~1800 characters so it pastes as ONE Discord message (free tier 2000).
- No em-dash characters. Use commas or periods.
- Do not invent facts. Only use the signal payload.
- Include the source URL when provided.`;

function userPrompt(signal) {
  return `Write a ready-to-paste Discord #announcements post for this signal.

Type: ${signal.type}
Title: ${signal.title}
Summary / source text:
${signal.summary}

URL: ${signal.url || '(none)'}
Meta JSON: ${JSON.stringify(signal.meta || {})}

Channel: #announcements (community main announcements, NOT #production-releases).
If type=milestone: celebrate the star count, thank the community, link the repo, keep it tight.
If type=tweet: amplify the news in Discord voice; link the tweet; do not just paste the tweet.
If type=release: short teaser that a release shipped; point people to #production-releases for the full changelog; include release URL.
If type=manual: treat summary as the source material.`;
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
      stars && stars !== n
        ? `We're at about ${Number(stars).toLocaleString()} right now. Wild for an open-source knowledge-graph memory layer.`
        : `Open-source knowledge-graph memory for AI coding assistants, growing because of this community.`,
      '',
      `Thank you for starring, shipping issues, and actually using it.`,
      '',
      url ? `Repo: ${url}` : '',
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

  text = deSlop(text).trim();
  const budget = config.fitLimit > 0 ? Math.min(config.fitLimit, 1990) : 1990;
  // Soft trim: if over budget, keep head (announcements should stay short).
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

module.exports = { draftAnnouncement, templateDraft };
