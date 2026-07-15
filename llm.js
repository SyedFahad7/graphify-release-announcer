const config = require('./config');
const { emptySections, deSlop } = require('./parse');

const SYSTEM = `You are the developer who ships ${config.productName}, writing the release post
yourself for your Discord #production-releases channel. ${config.productName} is an open-source
knowledge-graph memory layer for AI coding assistants (YC S26, PyPI package "${config.pypiPackage}").
Model the voice on Coolify's release posts: plain, factual, a little warm, written by a human dev.

VOICE — sound human, not like AI:
- NEVER use the em-dash "—". Use a period, comma, or parentheses instead. This is the #1 rule.
- No hype or filler: no "we're thrilled/excited to announce", "seamlessly", "robust", "powerful",
  "game-changing", "delve", "elevate", "unleash", "supercharge". Just say what changed.
- Vary sentence shape. Contractions are fine. Lead with the user-facing effect.

BULLETS:
- ONE short line per item. Keep the author's inline code (backticks) for commands, flags, files.
- CLEAN STYLE (default true): do NOT include issue/PR numbers (#1234) or "thanks @contributor".
  Only keep them if CLEAN_STYLE is false.
- Do NOT invent anything. Use only what's in the notes. Omit empty categories.

INTRO:
- 1-2 sentences, conversational, no heading and no version number. Say what kind of release this
  is and why someone should upgrade. No em-dash.

NOTES:
- Put upgrade caveats / heads-ups (logout required, beta warnings, cloud rollout timing) in "notes"
  as short standalone sentences.

Return ONLY valid minified JSON. No markdown, no commentary.`;

function userPrompt(release) {
  return `CLEAN_STYLE=${config.cleanStyle}

Release: ${release.name} (${release.tag})
Repo: ${config.githubRepo}

--- RAW RELEASE NOTES (markdown) ---
${(release.body || '').slice(0, 12000)}
--- END NOTES ---

Return JSON with this exact shape (omit any category that has no items; use [] if unsure):
{
  "intro": "one or two sentence lead summary, human voice, no em-dash",
  "sections": {
    "new_features": ["..."],
    "bug_fixes": ["..."],
    "security": ["..."],
    "breaking": ["..."],
    "services": ["..."],
    "other": ["..."],
    "notes": ["short upgrade caveat / heads-up sentences"]
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
        .map((x) => deSlop(String(x).replace(/\s+/g, ' ').trim()))
        .filter(Boolean);
    }
  }
  const intro = deSlop(String(parsed.intro || '').replace(/\s+/g, ' ').trim());
  return { intro, sections };
}

module.exports = { polishWithLLM };
