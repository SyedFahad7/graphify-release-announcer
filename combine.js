const config = require('./config');
const { emptySections, SECTION_ORDER, parseReleaseBody } = require('./parse');
const { polishCombinedWithLLM } = require('./llm');
const { buildChannels } = require('./channels');

const MAX_COMBINE = 4;
const MIN_COMBINE = 2;

function parseSemver(tag) {
  const m = String(tag || '')
    .replace(/^v/, '')
    .match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function compareReleases(a, b) {
  const sa = parseSemver(a.tag);
  const sb = parseSemver(b.tag);
  if (sa && sb) {
    for (let i = 0; i < 3; i++) {
      if (sa[i] !== sb[i]) return sa[i] - sb[i];
    }
    return 0;
  }
  const da = Date.parse(a.publishedAt || 0) || 0;
  const db = Date.parse(b.publishedAt || 0) || 0;
  return da - db;
}

function normKey(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 80);
}

function mergeContents(contents) {
  const sections = emptySections();
  const seen = new Set();

  for (const content of contents) {
    for (const key of SECTION_ORDER) {
      const items = content.sections?.[key] || [];
      for (const item of items) {
        const k = normKey(item);
        if (!k || seen.has(k)) continue;
        seen.add(k);
        sections[key].push(item);
      }
    }
  }

  return { intro: '', sections };
}

function listTagsHuman(tags) {
  if (tags.length === 2) return `${tags[0]} and ${tags[1]}`;
  return `${tags.slice(0, -1).join(', ')}, and ${tags[tags.length - 1]}`;
}

/**
 * Coolify-style catch-up intro when you missed announcing in-between tags.
 */
function buildCombinedIntro(tagsOldestFirst, latestTag) {
  const n = tagsOldestFirst.length;
  const span = listTagsHuman(tagsOldestFirst);
  return (
    `Catching up on the last ${n} releases. This covers ${span}. ` +
    `Upgrade to ${latestTag} to stay current.`
  );
}

function sectionCount(content) {
  return Object.values(content.sections || {}).reduce((n, a) => n + (a?.length || 0), 0);
}

/**
 * Build a combined announcement from 2–4 release tags.
 * Prefers one thorough Claude pass over all notes so the post feels multi-release sized.
 */
async function buildCombinedAnnouncement(tags, opts = {}) {
  const { noLlm = false, forPosting = false, log = () => {} } = opts;

  const unique = [...new Set(tags.map((t) => String(t).trim()).filter(Boolean))];
  if (unique.length < MIN_COMBINE || unique.length > MAX_COMBINE) {
    throw new Error(`Pick ${MIN_COMBINE}–${MAX_COMBINE} releases to combine (got ${unique.length}).`);
  }

  const github = require('./github');
  const fetched = [];
  for (const tag of unique) {
    log(`fetching ${tag}`);
    fetched.push(await github.getReleaseByTag(tag));
  }

  fetched.sort(compareReleases);
  const tagsOldestFirst = fetched.map((r) => r.tag);
  const latest = fetched[fetched.length - 1];
  const oldest = fetched[0];

  let content = null;
  let source = 'parser';

  // One Claude pass over ALL notes (thorough). Do not polish each release separately
  // then merge, that was making catch-ups feel like a single skinny release.
  if (!noLlm && config.anthropicApiKey) {
    try {
      log('polishing catch-up with Claude (full coverage across all tags)');
      content = await polishCombinedWithLLM(fetched);
      if (sectionCount(content) > 0 || content.intro) {
        source = 'llm';
      } else {
        log('LLM returned nothing usable, merging parsers');
        content = null;
      }
    } catch (err) {
      log(`LLM catch-up failed (${err.message}); merging parsers`);
      content = null;
    }
  } else if (!noLlm) {
    log('no ANTHROPIC_API_KEY, merging built-in parsers');
  } else {
    log('using built-in parsers (--no-llm)');
  }

  if (!content) {
    const parsed = fetched.map((r) => parseReleaseBody(r.body));
    content = mergeContents(parsed);
    content.intro = buildCombinedIntro(tagsOldestFirst, latest.tag);
    source = 'parser';
  } else if (!content.intro) {
    content.intro = buildCombinedIntro(tagsOldestFirst, latest.tag);
  }

  const combinedRelease = {
    ...latest,
    name: `${config.productName} ${oldest.tag} → ${latest.tag}`,
    body: '',
  };

  const spanLabel = `${oldest.tag} → ${latest.tag}`;
  const releaseLinks = fetched.map((r) => ({ tag: r.tag, url: r.url }));

  // Keep the full write-up. Discord's 2000 limit is handled via chunks in the UI.
  const posts = buildChannels(combinedRelease, content, {
    forPosting,
    fitLimit: 0,
    combined: {
      tags: tagsOldestFirst,
      spanLabel,
      releaseLinks,
    },
  });

  return {
    release: {
      tag: latest.tag,
      name: combinedRelease.name,
      url: latest.url,
      prerelease: fetched.some((r) => r.prerelease),
      draft: false,
      publishedAt: latest.publishedAt,
      author: latest.author,
      combined: true,
      tags: tagsOldestFirst,
      spanLabel,
    },
    releases: fetched.map((r) => ({
      tag: r.tag,
      name: r.name,
      url: r.url,
      publishedAt: r.publishedAt,
      prerelease: r.prerelease,
    })),
    source,
    posts,
    tags: tagsOldestFirst,
  };
}

module.exports = {
  buildCombinedAnnouncement,
  mergeContents,
  buildCombinedIntro,
  MAX_COMBINE,
  MIN_COMBINE,
};
