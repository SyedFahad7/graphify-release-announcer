const fs = require('fs');
const path = require('path');

const PACK_DIR_CANDIDATES = [
  path.join(process.cwd(), 'brand', 'reddit'),
  path.join(__dirname, '..', 'brand', 'reddit'),
];

function resolvePackDir() {
  for (const dir of PACK_DIR_CANDIDATES) {
    if (fs.existsSync(path.join(dir, 'subs.json'))) return dir;
  }
  return PACK_DIR_CANDIDATES[0];
}

function readText(file, fallback = '') {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return fallback;
  }
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

/**
 * Load shipped Reddit pack (voice, bans, formulas, subs).
 */
function loadRedditPack() {
  const dir = resolvePackDir();
  return {
    dir,
    voice: readText(path.join(dir, 'voice.md'), ''),
    bans: readText(path.join(dir, 'bans.md'), ''),
    formulas: readText(path.join(dir, 'formulas.md'), ''),
    subs: readJson(path.join(dir, 'subs.json'), []),
  };
}

function listSubs() {
  return loadRedditPack().subs;
}

function findSub(idOrLabel) {
  const raw = String(idOrLabel || '')
    .trim()
    .replace(/^r\//i, '');
  const subs = listSubs();
  return (
    subs.find((s) => s.id.toLowerCase() === raw.toLowerCase()) ||
    subs.find((s) => s.label.replace(/^r\//i, '').toLowerCase() === raw.toLowerCase()) ||
    null
  );
}

/**
 * Compact prompt block for Claude.
 */
function redditPromptBlock({ subreddit, angle, subtlety } = {}) {
  const pack = loadRedditPack();
  const sub = findSub(subreddit);
  const parts = [
    '## Reddit voice pack',
    pack.voice.slice(0, 3500),
    '',
    '## Bans',
    pack.bans.slice(0, 2000),
    '',
    '## Formulas',
    pack.formulas.slice(0, 2500),
  ];
  if (sub) {
    parts.push(
      '',
      `## Target sub: r/${sub.id}`,
      `promoPolicy: ${sub.promoPolicy}`,
      `rulesNote: ${sub.rulesNote}`,
      `flairHint: ${sub.flairHint || 'none'}`,
      `preferredAngle: ${angle || sub.defaultAngle}`
    );
  } else if (subreddit) {
    parts.push('', `## Target sub: r/${String(subreddit).replace(/^r\//i, '')}`, 'Unknown sub — be extra careful about self-promo.');
  }
  if (subtlety != null) {
    parts.push('', `## Subtlety level: ${subtlety}/10 (see product mention ladder in voice pack)`);
  }
  return parts.join('\n');
}

/**
 * Compact grounding from checkSignals result for Claude + UI.
 */
function buildGroundingBundle(checkResult) {
  const stars = checkResult?.stars || null;
  const signals = Array.isArray(checkResult?.signals) ? checkResult.signals : [];

  const release = signals.find((s) => s.type === 'release') || null;
  const tweets = signals
    .filter((s) => s.type === 'tweet')
    .slice(0, 5)
    .map((s) => ({
      id: s.id,
      title: s.title,
      summary: (s.summary || '').slice(0, 280),
      url: s.url,
      handle: s.meta?.handle || null,
    }));
  const news = signals
    .filter((s) => s.type === 'news')
    .slice(0, 8)
    .map((s) => ({
      id: s.id,
      title: s.title,
      summary: (s.summary || '').slice(0, 220),
      url: s.url,
      publishedAt: s.meta?.publishedAt || null,
      host: s.meta?.host || null,
      source: s.meta?.source || null,
    }));
  const milestones = signals
    .filter((s) => s.type === 'milestone')
    .slice(0, 3)
    .map((s) => ({
      id: s.id,
      title: s.title,
      stars: s.meta?.stars || stars?.count || null,
      milestone: s.meta?.milestone || null,
      url: s.url,
    }));

  return {
    checkedAt: checkResult?.checkedAt || new Date().toISOString(),
    stars: stars
      ? { count: stars.count, url: stars.url, fullName: stars.fullName }
      : null,
    release: release
      ? {
          tag: release.meta?.tag || release.title,
          title: release.title,
          summary: (release.summary || '').slice(0, 300),
          url: release.url,
          publishedAt: release.meta?.publishedAt || null,
        }
      : null,
    tweets,
    news,
    milestones,
    exa: checkResult?.exa
      ? { signalCount: checkResult.exa.signalCount, searchCount: checkResult.exa.searchCount }
      : null,
    rss: checkResult?.rss ? { signalCount: checkResult.rss.signalCount } : null,
  };
}

function groundingPromptText(grounding) {
  if (!grounding) return '(no grounding — do not invent metrics)';
  const lines = ['GROUNDING (only cite these facts):'];
  if (grounding.stars) {
    lines.push(`- GitHub stars: ${Number(grounding.stars.count).toLocaleString()} (${grounding.stars.fullName})`);
    lines.push(`  ${grounding.stars.url}`);
  }
  if (grounding.release) {
    lines.push(`- Latest release: ${grounding.release.tag} — ${grounding.release.title}`);
    if (grounding.release.url) lines.push(`  ${grounding.release.url}`);
  }
  for (const m of grounding.milestones || []) {
    lines.push(`- Milestone signal: ${m.title}`);
  }
  if ((grounding.tweets || []).length) {
    lines.push('- Recent X / founder posts:');
    for (const t of grounding.tweets) {
      lines.push(`  • ${t.title}: ${t.summary}${t.url ? ` (${t.url})` : ''}`);
    }
  }
  if ((grounding.news || []).length) {
    lines.push('- Third-party coverage (prefer citing these over self-hype):');
    for (const n of grounding.news) {
      const when = n.publishedAt ? ` [${n.publishedAt.slice(0, 10)}]` : '';
      lines.push(`  •${when} ${n.title}${n.url ? ` — ${n.url}` : ''}`);
    }
  }
  return lines.join('\n');
}

module.exports = {
  loadRedditPack,
  listSubs,
  findSub,
  redditPromptBlock,
  buildGroundingBundle,
  groundingPromptText,
};
