const config = require('./config');
const { emptySections } = require('./parse');
const { buildAnnouncement } = require('./format');

// Keep only the given section keys; drop the rest.
function pick(content, keys) {
  const sections = emptySections();
  for (const k of keys) sections[k] = content.sections[k] || [];
  return { intro: content.intro, sections };
}

function count(content, keys) {
  return keys.reduce((n, k) => n + (content.sections[k]?.length || 0), 0);
}

const P = () => config.productName;

/**
 * From one release + grouped content, produce a post per channel.
 * Returns [{ key, label, channel, applicable, text }].
 * `applicable=false` posts (e.g. no security fixes this release) are included
 * so the UI can show/grey them; skip them when applicable is false if you like.
 */
function buildChannels(release, content, { forPosting = false } = {}) {
  const tag = release.tag;
  const results = [];

  // 1) Production — the full post (stable releases).
  results.push({
    key: 'production',
    label: 'Production Releases',
    channel: '#production-releases',
    applicable: !release.prerelease,
    text: buildAnnouncement(release, content, {
      forPosting,
      roleName: 'Production Releases',
      headline: `**${P()} ${tag} is now live** ${config.releaseEmoji}`,
    }),
  });

  // 2) Feature — only the exciting stuff (highlights + new features + integrations).
  const featureKeys = ['highlights', 'new_features', 'services'];
  const featureContent = pick(content, featureKeys);
  results.push({
    key: 'feature',
    label: 'Feature Releases',
    channel: '#feature-releases',
    applicable: count(content, featureKeys) > 0,
    text: buildAnnouncement(release, featureContent, {
      forPosting,
      roleName: 'Feature Releases',
      headline: `**✨ What's new in ${P()} ${tag}**`,
      highlightsLabel: '',
    }),
  });

  // 3) Security — only when the release has security fixes.
  const securityContent = pick(content, ['security']);
  results.push({
    key: 'security',
    label: 'Security',
    channel: '#security',
    applicable: count(content, ['security']) > 0,
    text: buildAnnouncement(release, securityContent, {
      forPosting,
      roleName: 'Security',
      headline: `**🔒 Security update in ${P()} ${tag}** — upgrade recommended`,
      highlightsLabel: '',
    }),
  });

  // 4) Beta — only for prereleases.
  results.push({
    key: 'beta',
    label: 'Beta / Prerelease',
    channel: '#beta',
    applicable: Boolean(release.prerelease),
    text: buildAnnouncement(release, content, {
      forPosting,
      roleName: 'Beta Testers',
      headline: `**🧪 ${P()} ${tag} (beta) is available for testing**`,
    }),
  });

  return results;
}

module.exports = { buildChannels };
