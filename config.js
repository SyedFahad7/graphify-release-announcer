require('dotenv').config();

function bool(v, fallback) {
  if (v === undefined || v === '') return fallback;
  return /^(1|true|yes|on)$/i.test(String(v).trim());
}

function int(v, fallback) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

const config = {
  githubRepo: process.env.GITHUB_REPO || 'Graphify-Labs/graphify',
  githubToken: process.env.GITHUB_TOKEN || '',

  productName: process.env.PRODUCT_NAME || 'Graphify',
  pypiPackage: process.env.PYPI_PACKAGE || 'graphifyy',
  // Discord custom emoji: <:name:id>. Default is the Graphify Labs server emoji.
  // Override with RELEASE_EMOJI, or RELEASE_EMOJI_NAME + RELEASE_EMOJI_ID.
  releaseEmoji: (() => {
    if (process.env.RELEASE_EMOJI) return process.env.RELEASE_EMOJI;
    const id = process.env.RELEASE_EMOJI_ID || '1526877858390081616';
    const name = process.env.RELEASE_EMOJI_NAME || 'graphify';
    return `<:${name}:${id}>`;
  })(),

  anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
  anthropicModel: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6',

  discordToken: process.env.DISCORD_TOKEN || '',
  channelId: process.env.PRODUCTION_RELEASES_CHANNEL_ID || '',
  roleId: process.env.PRODUCTION_RELEASES_ROLE_ID || '',
  roleName: process.env.RELEASE_ROLE_NAME || 'Production Releases',

  // Post style preset. "peak" = big H1 title + emoji section headers + flat bullets.
  // "shadow" = inline bold title + hollow nested sub-bullets. (both modelled on the
  // two Coolify #production-releases admins). Per-channel overrides live in channels.js.
  postTheme: (process.env.POST_THEME || 'peak').toLowerCase(),

  // 0 = show all items in a section (Coolify-style, full list). Set a number to cap.
  maxItemsPerSection: int(process.env.MAX_ITEMS_PER_SECTION, 0),
  // Discord paste budget for ONE message (so it does not become a .txt file).
  // Free accounts = 2000, Nitro = 4000. Coolify's big catch-up posts land ~3800
  // because Peak posts with Nitro + short bullets. Set DISCORD_NITRO=true for 3900,
  // or override with DISCORD_CHAR_LIMIT. 0 disables fitting.
  fitLimit: (() => {
    if (process.env.DISCORD_CHAR_LIMIT !== undefined && process.env.DISCORD_CHAR_LIMIT !== '') {
      return int(process.env.DISCORD_CHAR_LIMIT, 1990);
    }
    return bool(process.env.DISCORD_NITRO, false) ? 3900 : 1990;
  })(),
  // Clean, Coolify-style bullets: strip (#123) issue/PR refs and "thanks @x" credits,
  // keep lines short. Set CLEAN_STYLE=false for dev-detailed output (refs + credits kept).
  cleanStyle: bool(process.env.CLEAN_STYLE, true),

  // --- #announcements studio ---
  // Same Bearer as graphify-social-bot / graphify-tweet-agent (read-only X API v2).
  twitterBearerToken: process.env.TWITTER_BEARER_TOKEN || '',
  announceHandles: (process.env.ANNOUNCE_HANDLES || 'safishamsii,graphify')
    .split(',')
    .map((h) => h.trim().replace(/^@/, ''))
    .filter(Boolean),
  starMilestones: (process.env.STAR_MILESTONES || '80000,90000,100000')
    .split(',')
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => Number.isFinite(n) && n > 0)
    .sort((a, b) => a - b),
  announcePing: process.env.ANNOUNCE_PING || '@everyone',
  tweetsPerHandle: int(process.env.ANNOUNCE_TWEETS_PER_HANDLE, 8),

  // Announcement images: Claude brainstorms + SVG; optional OpenAI for raster PNG.
  // Anthropic cannot emit PNGs — it owns taste / SVG. Engine: anthropic | openai | auto.
  anthropicImageModel: process.env.ANTHROPIC_IMAGE_MODEL || process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6',
  announceImageThinkingBudget: int(process.env.ANNOUNCE_IMAGE_THINKING_BUDGET, 8000),
  // Default anthropic: Claude brief + SVG (no OpenAI required). Set auto if you add OPENAI_API_KEY.
  announceImageEngine: (process.env.ANNOUNCE_IMAGE_ENGINE || 'anthropic').toLowerCase(),
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  openaiImageModel: process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1.5',
  openaiImageQuality: process.env.OPENAI_IMAGE_QUALITY || 'high',
};

module.exports = config;
