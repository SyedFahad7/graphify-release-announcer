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

COVERAGE (important):
- Be thorough. Include every change that matters to users or operators. Prefer a fuller post over a
  skinny one. Do NOT aggressively summarize away important fixes, features, security items, or
  upgrade notes just to stay short.
- One clear line per bullet is fine, but the line can be a full sentence when the change needs it.
- Keep the author's inline code (backticks) for commands, flags, files, APIs.
- CLEAN STYLE (default true): do NOT include issue/PR numbers (#1234) or "thanks @contributor".
  Only keep them if CLEAN_STYLE is false.
- Do NOT invent anything. Use only what's in the notes. Omit empty categories.

INTRO:
- 1-3 sentences, conversational, no heading and no version number. Say what kind of release this
  is and why someone should upgrade. No em-dash.

NOTES:
- Put upgrade caveats / heads-ups in "notes" as standalone sentences. Keep all of them if they
  matter (force re-extract, migration, skill follow-ups, cache warnings, etc.).

Return ONLY valid minified JSON. No markdown, no commentary.`;

const COMBINE_SYSTEM = `You are the developer who ships ${config.productName}, writing a CATCH-UP
Discord post for #production-releases that covers MULTIPLE releases someone missed announcing.
${config.productName} is an open-source knowledge-graph memory layer for AI coding assistants
(YC S26, PyPI package "${config.pypiPackage}").

This is NOT a skinny summary. Readers skipped a few versions and need a real announcement that
feels like it covers all of them, the way Coolify sometimes spans several releases in one post.

VOICE:
- NEVER use the em-dash "—". Use a period, comma, or parentheses instead.
- No hype filler. Plain, factual, a little warm. Human dev voice. Contractions ok.

COVERAGE (critical):
- Pull important items from EVERY release in the set. Features, fixes, security, breaking changes,
  integrations, and upgrade notes. If two releases each had a solid changelog, the combined post
  should clearly feel bigger than a single-release post.
- Deduplicate only when the same change is restated. Prefer keeping distinct fixes/features.
- One clear line per bullet; full sentences are welcome when needed.
- CLEAN STYLE (default true): no issue/PR numbers, no "thanks @contributor" unless CLEAN_STYLE is false.
- Do NOT invent changes. Only use the provided notes.

INTRO:
- 2-4 sentences. Open by saying this catches up on the listed versions, then say what themes
  landed across them (correctness, security, features, etc.). End with upgrade to the newest tag.
  No em-dash. No markdown heading.

NOTES:
- Keep every meaningful upgrade caveat from any of the releases.

Return ONLY valid minified JSON. No markdown, no commentary.`;

function userPrompt(release) {
  return `CLEAN_STYLE=${config.cleanStyle}

Release: ${release.name} (${release.tag})
Repo: ${config.githubRepo}

--- RAW RELEASE NOTES (markdown) ---
${(release.body || '').slice(0, 14000)}
--- END NOTES ---

Return JSON with this exact shape (omit any category that has no items; use [] if unsure):
{
  "intro": "1-3 sentence lead summary, human voice, no em-dash",
  "sections": {
    "new_features": ["..."],
    "bug_fixes": ["..."],
    "security": ["..."],
    "breaking": ["..."],
    "services": ["..."],
    "other": ["..."],
    "notes": ["upgrade caveat / heads-up sentences"]
  }
}`;
}

function combineUserPrompt(releases) {
  const blocks = releases
    .map(
      (r) =>
        `===== ${r.tag} (${r.name}) =====\n${(r.body || '').slice(0, 8000)}\n===== END ${r.tag} =====`
    )
    .join('\n\n');
  const tags = releases.map((r) => r.tag).join(', ');
  const latest = releases[releases.length - 1].tag;

  return `CLEAN_STYLE=${config.cleanStyle}

Catch-up announcement spanning these releases (oldest → newest): ${tags}
Newest install target: ${latest}
Repo: ${config.githubRepo}

Include important items from ALL of them. The post should feel like a real multi-release catch-up,
not a one-release sized blurb.

${blocks}

Return JSON with this exact shape (omit empty categories; use [] if unsure):
{
  "intro": "2-4 sentence catch-up lead covering these versions, human voice, no em-dash",
  "sections": {
    "new_features": ["..."],
    "bug_fixes": ["..."],
    "security": ["..."],
    "breaking": ["..."],
    "services": ["..."],
    "other": ["..."],
    "notes": ["upgrade caveat / heads-up sentences from any of the releases"]
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

function normalizeLlmContent(parsed) {
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

async function callClaude({ system, user, maxTokens }) {
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
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Anthropic API ${res.status}: ${body.slice(0, 200)}`);
  }

  const data = await res.json();
  return (data.content || [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('');
}

/**
 * Rewrite release notes into { intro, sections } via Claude.
 * Throws on any failure so the caller can fall back to the deterministic parser.
 */
async function polishWithLLM(release) {
  const text = await callClaude({
    system: SYSTEM,
    user: userPrompt(release),
    maxTokens: 4096,
  });
  return normalizeLlmContent(extractJson(text));
}

/**
 * One Claude pass over several releases for a thorough catch-up announcement.
 * `releases` must already be sorted oldest → newest.
 */
async function polishCombinedWithLLM(releases) {
  const text = await callClaude({
    system: COMBINE_SYSTEM,
    user: combineUserPrompt(releases),
    maxTokens: 8192,
  });
  return normalizeLlmContent(extractJson(text));
}

module.exports = { polishWithLLM, polishCombinedWithLLM };
