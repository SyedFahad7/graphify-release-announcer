const config = require('./config');
const { emptySections } = require('./parse');

const SYSTEM = `You are the DevRel release editor for ${config.productName}, an open-source
knowledge-graph memory layer for AI coding assistants (YC S26, PyPI package "${config.pypiPackage}").

You turn raw GitHub release notes into a crisp, community-friendly announcement for a Discord
#production-releases channel, in the exact style teams like Coolify use: short punchy bullets
grouped by category, written for users/developers (not commit-log jargon).

Rules:
- Rewrite tersely and clearly, like Coolify's release posts. ONE short line per item, lead with the user-facing effect. Cut internal jargon.
- CLEAN STYLE (default): do NOT include issue/PR numbers (#1234) or "thanks @contributor" credits. Only include them if CLEAN_STYLE is false.
- Do NOT invent changes. Only use what is in the notes. Omit empty categories.
- Put ONE punchy 1-2 sentence summary in "intro" (no heading, no version number).
- Return ONLY valid minified JSON. No markdown, no commentary.`;

function userPrompt(release) {
  return `CLEAN_STYLE=${config.cleanStyle}

Release: ${release.name} (${release.tag})
Repo: ${config.githubRepo}

--- RAW RELEASE NOTES (markdown) ---
${(release.body || '').slice(0, 12000)}
--- END NOTES ---

Return JSON with this exact shape (omit any category that has no items; use [] if unsure):
{
  "intro": "one or two sentence lead summary",
  "sections": {
    "new_features": ["..."],
    "bug_fixes": ["..."],
    "security": ["..."],
    "breaking": ["..."],
    "services": ["..."],
    "other": ["..."]
  }
}`;
}

function extractJson(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('No JSON object found in LLM response');
  }
  return JSON.parse(text.slice(start, end + 1));
}

/**
 * Rewrite release notes into { intro, sections } via Claude.
 * Throws on any failure so the caller can fall back to the deterministic parser.
 */
async function polishWithLLM(release) {
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
      max_tokens: 2000,
      system: SYSTEM,
      messages: [{ role: 'user', content: userPrompt(release) }],
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
    .join('');

  const parsed = extractJson(text);
  const sections = emptySections();
  for (const key of Object.keys(sections)) {
    const items = parsed.sections?.[key];
    if (Array.isArray(items)) {
      sections[key] = items
        .map((x) => String(x).replace(/\s+/g, ' ').trim())
        .filter(Boolean);
    }
  }
  const intro = String(parsed.intro || '').replace(/\s+/g, ' ').trim();
  return { intro, sections };
}

module.exports = { polishWithLLM };
