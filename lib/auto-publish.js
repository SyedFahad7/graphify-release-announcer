const crypto = require('crypto');
const config = require('../config');
const github = require('../github');
const queue = require('./release-queue');
const { buildProduction } = require('./poll-releases');
const { buildCombinedAnnouncement, MAX_COMBINE } = require('../combine');
const { postAnnouncement } = require('../discord');

const LOCK = '__autopublish__';
const LOCK_WAIT_MS = 400;
const LOCK_STALE_MS = 8 * 60 * 1000;
const HANDLED = new Set(['sent', 'skipped', 'seeded']);
const TAG_IN_URL = /releases\/tag\/([A-Za-z0-9._+-]+)/g;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Releases to announce. Anything already posted (or explicitly seeded/skipped)
 * sets a watermark. Only stable releases published after that watermark are new.
 * An empty history seeds instead of posting, so a first run cannot dump old tags.
 */
function selectUnposted(releases, handledTags, rows = []) {
  const stable = (releases || []).filter((r) => r && !r.draft && !r.prerelease);
  let watermark = 0;
  let known = false;

  const note = (tag, publishedAt) => {
    if (!handledTags.has(tag)) return;
    known = true;
    const t = Date.parse(publishedAt || 0) || 0;
    if (t > watermark) watermark = t;
  };

  for (const release of stable) note(release.tag, release.publishedAt);
  for (const row of rows) {
    if (row.tag === LOCK || !HANDLED.has(row.status)) continue;
    note(row.tag, row.published_at);
  }

  if (!known) return { seeded: true, unposted: [] };

  const unposted = stable
    .filter((r) => !handledTags.has(r.tag) && (Date.parse(r.publishedAt) || 0) > watermark)
    .sort((a, b) => Date.parse(a.publishedAt) - Date.parse(b.publishedAt));
  return { seeded: false, unposted };
}

async function tagsOnDiscord() {
  if (!config.discordToken || !config.channelId) {
    return { ok: false, tags: new Set() };
  }
  const res = await fetch(
    `https://discord.com/api/v10/channels/${config.channelId}/messages?limit=100`,
    { headers: { Authorization: `Bot ${config.discordToken}` } }
  );
  if (!res.ok) {
    console.error(`  ✗ discord history ${res.status}`);
    return { ok: false, tags: new Set() };
  }
  const messages = await res.json();
  const tags = new Set();
  for (const message of messages) {
    const text = message.content || '';
    TAG_IN_URL.lastIndex = 0;
    let match;
    while ((match = TAG_IN_URL.exec(text))) tags.add(decodeURIComponent(match[1]));
  }
  return { ok: true, tags };
}

async function tryLock() {
  const token = crypto.randomBytes(8).toString('hex');
  const now = new Date().toISOString();
  const existing = await queue.get(LOCK);
  if (existing?.status === 'pending' && existing.published_at) {
    const age = Date.now() - new Date(existing.published_at).getTime();
    if (age >= 0 && age < LOCK_STALE_MS) return false;
  }
  await queue.upsert({
    tag: LOCK,
    status: 'pending',
    name: token,
    published_at: now,
    source: 'lock',
  });
  await sleep(LOCK_WAIT_MS);
  const row = await queue.get(LOCK);
  return row?.name === token;
}

async function unlock() {
  await queue.upsert({
    tag: LOCK,
    status: 'skipped',
    name: 'idle',
    published_at: new Date().toISOString(),
    source: 'lock',
  });
}

async function markSent(releases, source) {
  const sentAt = new Date().toISOString();
  for (const release of releases) {
    await queue.upsert({
      tag: release.tag,
      status: 'sent',
      name: release.name,
      url: release.url,
      published_at: release.publishedAt,
      source,
      sent_at: sentAt,
    });
  }
}

async function publishBatch(batch) {
  if (batch.length === 1) {
    const built = await buildProduction(batch[0]);
    await postAnnouncement(built.postText);
    await markSent(batch, built.source);
    return { action: 'posted', tags: [batch[0].tag] };
  }
  const result = await buildCombinedAnnouncement(
    batch.map((r) => r.tag),
    { forPosting: true }
  );
  const production = result.posts.find((p) => p.key === 'production');
  await postAnnouncement(production.text);
  await markSent(batch, result.source);
  return { action: 'combined', tags: batch.map((r) => r.tag) };
}

/**
 * Post whatever stable releases are newer than the last one already in Discord
 * or marked sent. One release posts alone. Two to four post as one catch-up.
 * A longer gap posts the oldest four now and leaves the rest for the next run.
 */
async function autoPublish() {
  if (!queue.configured()) {
    return { ok: false, error: 'Supabase is not configured.' };
  }
  if (!config.discordToken || !config.channelId) {
    return { ok: false, error: 'Discord is not configured.' };
  }

  const locked = await tryLock();
  if (!locked) return { ok: true, action: 'busy' };

  try {
    const [rows, discord, recent] = await Promise.all([
      queue.listRecent(),
      tagsOnDiscord(),
      github.listReleases(20),
    ]);

    const handled = new Set(discord.tags);
    for (const row of rows || []) {
      if (row.tag !== LOCK && HANDLED.has(row.status)) handled.add(row.tag);
    }

    // No Discord history and no saved posts: remember the current latest and stop.
    if (!discord.ok && handled.size === 0) {
      const latest = recent.find((r) => !r.draft && !r.prerelease);
      if (latest) {
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
    }

    const { seeded, unposted } = selectUnposted(recent, handled, rows || []);
    if (seeded) {
      // Tags were found, but none of them are in this page of releases.
      // Seeding "latest" here would hide a release that still needs posting.
      if (handled.size > 0) {
        return { ok: true, action: 'hold' };
      }
      const latest = recent.find((r) => !r.draft && !r.prerelease);
      if (!latest) return { ok: true, action: 'none' };
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

    if (!unposted.length) return { ok: true, action: 'none' };

    const batch = unposted.slice(0, MAX_COMBINE);
    const result = await publishBatch(batch);
    return {
      ok: true,
      ...result,
      remaining: unposted.length - batch.length,
    };
  } finally {
    await unlock().catch((err) => console.error('  ✗ unlock failed:', err.message));
  }
}

function verifyGithubSignature(rawBody, signature) {
  const secret = process.env.RELEASE_WEBHOOK_SECRET || process.env.GITHUB_WEBHOOK_SECRET || '';
  if (!secret || !signature || !rawBody?.length) return false;
  const digest = Buffer.from(
    `sha256=${crypto.createHmac('sha256', secret).update(rawBody).digest('hex')}`
  );
  const sig = Buffer.from(signature);
  if (digest.length !== sig.length) return false;
  return crypto.timingSafeEqual(digest, sig);
}

module.exports = { autoPublish, selectUnposted, verifyGithubSignature };
