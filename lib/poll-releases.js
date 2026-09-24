const github = require('../github');
const { buildContent } = require('../content');
const { buildChannels } = require('../channels');
const queue = require('./release-queue');

async function buildProduction(release) {
  const { content, source } = await buildContent(release);
  const paste = buildChannels(release, content, { forPosting: false }).find((p) => p.key === 'production');
  const post = buildChannels(release, content, { forPosting: true }).find((p) => p.key === 'production');
  return { source, pasteText: paste.text, postText: post.text };
}

/**
 * Twice-daily check. The first run only records the current latest release so
 * history is not posted. Later runs queue anything newer as pending approval.
 */
async function pollNewReleases() {
  if (!queue.configured()) {
    return {
      ok: false,
      error: 'Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, and run supabase/migrations/002_release_drafts.sql.',
    };
  }

  const latest = await github.getLatestRelease();
  const rows = await queue.listRecent();

  if (!rows.length) {
    await queue.upsert({
      tag: latest.tag,
      status: 'seeded',
      name: latest.name,
      url: latest.url,
      published_at: latest.publishedAt,
      source: 'seed',
    });
    return { ok: true, action: 'seeded', tag: latest.tag };
  }

  const known = new Set(rows.map((r) => r.tag));
  const watermark = rows.reduce((max, r) => {
    const t = r.published_at ? new Date(r.published_at).getTime() : 0;
    return Math.max(max, t);
  }, 0);

  const recent = await github.listReleases(15);
  const fresh = recent
    .filter((r) => !r.draft && !r.prerelease && !known.has(r.tag))
    .filter((r) => new Date(r.publishedAt).getTime() > watermark)
    .sort((a, b) => new Date(a.publishedAt) - new Date(b.publishedAt))
    .slice(0, 3);

  const queued = [];
  for (const release of fresh) {
    const built = await buildProduction(release);
    await queue.upsert({
      tag: release.tag,
      status: 'pending',
      name: release.name,
      url: release.url,
      published_at: release.publishedAt,
      paste_text: built.pasteText,
      post_text: built.postText,
      source: built.source,
    });
    queued.push(release.tag);
  }

  return { ok: true, action: queued.length ? 'queued' : 'none', queued };
}

module.exports = { pollNewReleases, buildProduction };
