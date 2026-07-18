const config = require('./config');
const { emptySections, SECTION_ORDER } = require('./parse');
const { buildContent } = require('./content');
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

/**
 * Build a combined announcement from 2–4 release tags.
 * Returns { release, releases, source, posts, tags }.
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

  const contents = [];
  let source = 'parser';
  for (const release of fetched) {
    const built = await buildContent(release, { noLlm, log });
    contents.push(built.content);
    if (built.source === 'llm') source = 'llm';
  }

  const merged = mergeContents(contents);
  merged.intro = buildCombinedIntro(tagsOldestFirst, latest.tag);

  // Synthetic release: install/footer point at the newest tag.
  const combinedRelease = {
    ...latest,
    name: `${config.productName} ${oldest.tag} → ${latest.tag}`,
    // Keep body empty; we already merged structured content.
    body: '',
  };

  const spanLabel = `${oldest.tag} → ${latest.tag}`;
  const posts = buildChannels(combinedRelease, merged, {
    forPosting,
    combined: {
      tags: tagsOldestFirst,
      spanLabel,
      coverNote: `covers ${tagsOldestFirst.join(' · ')}`,
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
