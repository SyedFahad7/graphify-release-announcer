const config = require('./config');
const {
  loadCanon,
  canonPromptBlock,
  projectAgeLabel,
  softDeSlop,
  canonMeta,
} = require('./lib/canon');
const {
  findSub,
  redditPromptBlock,
  groundingPromptText,
  listSubs,
} = require('./lib/reddit-pack');

const ANGLES = [
  'builder_story',
  'milestone',
  'honest_review_seed',
  'discussion',
  'megathread_comment',
];

function wordCount(text) {
  return String(text || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

function stripDiscordLeakage(text) {
  return String(text || '')
    .replace(/<:\w+:\d+>/g, '')
    .replace(/@everyone/gi, '')
    .replace(/@here/gi, '')
    .replace(/\u2014/g, ',') // em-dash
    .replace(/\u2013/g, '-') // en-dash
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}

function validateRedditDraft(draft, { subtlety, sub }) {
  const warnings = [];
  let title = stripDiscordLeakage(draft.title || '');
  let body = stripDiscordLeakage(softDeSlop(draft.body || ''));

  const hard = [
    /drop a star/i,
    /smash a star/i,
    /thrilled/i,
    /excited to announce/i,
    /game-?changer/i,
    /supercharge/i,
    /keep the momentum/i,
    /graphify\.net/i,
  ];
  for (const re of hard) {
    if (re.test(title) || re.test(body)) {
      warnings.push(`stripped pattern: ${re}`);
      title = title.replace(re, '').replace(/\s{2,}/g, ' ').trim();
      body = body.replace(re, '').replace(/\s{2,}/g, ' ').trim();
    }
  }

  if (sub?.promoPolicy === 'megathread' && subtlety >= 6) {
    warnings.push('Sub is promo-hostile — consider megathread_comment angle or lower subtlety.');
  }

  const wc = wordCount(body);
  const ceiling =
    draft.angle === 'megathread_comment' || subtlety >= 9
      ? 180
      : draft.angle === 'discussion'
        ? 400
        : 250;
  if (wc > ceiling + 40) {
    warnings.push(`Body is long (${wc} words). Reddit mobile readers bounce — consider cutting.`);
  }

  return {
    title,
    body,
    wordCount: wordCount(body),
    warnings,
  };
}

function templateDraft({ subreddit, angle, subtlety, grounding, note }) {
  const sub = findSub(subreddit);
  const stars = grounding?.stars?.count
    ? Number(grounding.stars.count).toLocaleString()
    : null;
  const tag = grounding?.release?.tag || null;
  const { facts } = loadCanon();
  const age = projectAgeLabel(facts);
  const name = subtlety <= 2 ? 'this local graph tool' : 'Graphify';

  let title = 'tried something different for codebase context';
  let body = '';

  if (angle === 'milestone' && stars) {
    title = `${name} crossed ${stars} GitHub stars`;
    body = [
      `still weird to type that out.`,
      '',
      `open source knowledge-graph memory for coding assistants. started as a tiny skill ${age} ago.`,
      '',
      `thank you if you starred, filed issues, or actually used it on a real repo.`,
      subtlety >= 4 && grounding?.stars?.url ? `\n${grounding.stars.url}` : '',
    ]
      .filter(Boolean)
      .join('\n');
  } else if (angle === 'megathread_comment') {
    title = '(megathread comment — no title)';
    body = [
      `building ${name}: turns a folder into a queryable knowledge graph so your assistant stops re-reading the whole tree.`,
      tag ? `latest: ${tag}` : '',
      stars ? `~${stars} stars on github` : '',
      grounding?.stars?.url || 'https://github.com/Graphify-Labs/graphify',
    ]
      .filter(Boolean)
      .join('\n');
  } else if (angle === 'honest_review_seed') {
    const press = grounding?.news?.[0];
    title = press
      ? `anyone else tried the thing this write-up covers?`
      : `has anyone tried a graph layer instead of dumping the whole repo into context?`;
    body = [
      `i keep burning tokens watching the agent re-discover the same architecture every session.`,
      '',
      press
        ? `saw this: ${press.title}${press.url ? `\n${press.url}` : ''}`
        : `been poking at ${name} (${age} old, local AST pass for code).`,
      '',
      `curious if it actually helps on messy monorepos or if i'm romanticizing graphs.`,
      note ? `\n${note}` : '',
    ]
      .filter(Boolean)
      .join('\n');
  } else if (angle === 'discussion') {
    title = 'do you keep any persistent map of your codebase for agents, or just re-grep forever?';
    body = [
      `honest question.`,
      '',
      `every coding assistant session feels like onboarding a new hire who forgot yesterday.`,
      subtlety >= 3
        ? `\ni've been using ${name} as a local graph instead of raw context dumps. not sure it's the answer, but the "path between A and B" thing is useful.`
        : '',
      '',
      `what do you actually do day to day?`,
      note ? `\n${note}` : '',
    ]
      .filter(Boolean)
      .join('\n');
  } else {
    // builder_story
    title = `got tired of my coding agent re-reading the whole repo every time`;
    body = [
      `kept watching it burn context rediscovering auth → db paths i already explained last week.`,
      '',
      `tried ${name} on a real project. tree-sitter builds a local graph; you query/path/explain instead of grepping forever.`,
      '',
      `not magic. docs/media still need a model. but the code map staying on-device is the part that stuck.`,
      '',
      `curious how other people keep architecture in an agent's head.`,
      note ? `\n${note}` : '',
      subtlety >= 5 && grounding?.stars?.url ? `\n${grounding.stars.url}` : '',
    ]
      .filter(Boolean)
      .join('\n');
  }

  const validated = validateRedditDraft(
    { title, body, angle },
    { subtlety, sub }
  );

  return {
    title: validated.title,
    body: validated.body,
    wordCount: validated.wordCount,
    flairHint: sub?.flairHint || null,
    riskNotes: [
      ...(validated.warnings || []),
      sub?.rulesNote || null,
      sub?.promoPolicy === 'megathread'
        ? 'Prefer a megathread comment over a top-level post.'
        : null,
    ].filter(Boolean),
    postingTip:
      sub?.promoPolicy === 'open'
        ? 'Showcase-friendly sub — still keep under ~200 words.'
        : 'Read the sub sticky today before posting; rules drift.',
    altTitles: [],
    angle,
    subreddit: sub ? sub.id : String(subreddit || '').replace(/^r\//i, ''),
    source: 'template',
    subtlety,
    canon: canonMeta(),
  };
}

function buildSystem({ subreddit, angle, subtlety }) {
  const { facts } = loadCanon();
  return `You write ready-to-paste Reddit posts for Graphify Labs (YC ${facts.ycBatch || 'S26'}).
Graphify is an open-source knowledge-graph memory layer for AI coding assistants (PyPI: ${facts.pypiPackage || 'graphifyy'}).

${canonPromptBlock({ signalType: '*' })}

${redditPromptBlock({ subreddit, angle, subtlety })}

Output rules:
- Return ONLY valid JSON (no markdown fences) with keys:
  title (string), body (string), flairHint (string|null), riskNotes (string[]),
  postingTip (string), altTitles (string[2]).
- For megathread_comment, title may be "(megathread comment — no title)" and body is the comment.
- No Discord emoji. No @everyone. No em-dash characters.
- Do not invent stars, downloads, or dates. Use grounding only.
- Never cite graphify.net as official.`;
}

function buildUser({ subreddit, angle, subtlety, note, grounding }) {
  const { facts } = loadCanon();
  const age = projectAgeLabel(facts);
  const sub = findSub(subreddit);
  return `Draft one Reddit ${angle === 'megathread_comment' ? 'comment' : 'post'}.

Subreddit: r/${sub ? sub.id : String(subreddit || '').replace(/^r\//i, '')}
Angle: ${angle}
Subtlety: ${subtlety}/10
Canon project age: ${age}
Extra note from human: ${note || '(none)'}

${groundingPromptText(grounding)}

Write JSON now.`;
}

async function callClaude(system, user) {
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
      max_tokens: 1600,
      system,
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
  return text.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/, '').trim();
}

function parseDraftJson(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        return JSON.parse(m[0]);
      } catch {
        return null;
      }
    }
    return null;
  }
}

/**
 * Draft a paste-ready Reddit post.
 */
async function draftRedditPost({
  subreddit,
  angle = 'builder_story',
  subtlety = 3,
  note = '',
  grounding = null,
  noLlm = false,
} = {}) {
  const sub = findSub(subreddit) || {
    id: String(subreddit || 'SideProject').replace(/^r\//i, ''),
    promoPolicy: 'careful',
    flairHint: null,
    rulesNote: null,
  };
  let resolvedAngle = ANGLES.includes(angle) ? angle : sub.defaultAngle || 'builder_story';
  if (sub.promoPolicy === 'megathread' && resolvedAngle !== 'discussion' && resolvedAngle !== 'megathread_comment') {
    // Soft steer: keep user's angle but they'll see risk notes
  }
  const level = Math.min(10, Math.max(1, parseInt(subtlety, 10) || 3));

  const base = {
    subreddit: sub.id,
    angle: resolvedAngle,
    subtlety: level,
    grounding,
    note,
  };

  if (noLlm || !config.anthropicApiKey) {
    return templateDraft(base);
  }

  try {
    const raw = await callClaude(
      buildSystem({ subreddit: sub.id, angle: resolvedAngle, subtlety: level }),
      buildUser({ ...base, subreddit: sub.id })
    );
    const parsed = parseDraftJson(raw);
    if (!parsed || !parsed.body) return templateDraft(base);

    const validated = validateRedditDraft(
      { title: parsed.title, body: parsed.body, angle: resolvedAngle },
      { subtlety: level, sub }
    );

    return {
      title: validated.title || parsed.title || 'untitled',
      body: validated.body,
      wordCount: validated.wordCount,
      flairHint: parsed.flairHint || sub.flairHint || null,
      riskNotes: [
        ...(Array.isArray(parsed.riskNotes) ? parsed.riskNotes : []),
        ...(validated.warnings || []),
        sub.rulesNote,
      ].filter(Boolean),
      postingTip:
        parsed.postingTip ||
        (sub.promoPolicy === 'megathread'
          ? 'Use the weekly megathread if this is promo-shaped.'
          : 'Paste manually. One sub only — rewrite for the next.'),
      altTitles: Array.isArray(parsed.altTitles)
        ? parsed.altTitles.map(stripDiscordLeakage).filter(Boolean).slice(0, 2)
        : [],
      angle: resolvedAngle,
      subreddit: sub.id,
      source: 'llm',
      subtlety: level,
      canon: canonMeta(),
    };
  } catch {
    return templateDraft(base);
  }
}

module.exports = {
  draftRedditPost,
  templateDraft,
  ANGLES,
  listAngles: () => ANGLES,
  listSubs,
};
