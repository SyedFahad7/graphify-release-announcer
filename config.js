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
  releaseEmoji: process.env.RELEASE_EMOJI || '🎉',

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
};

module.exports = config;
