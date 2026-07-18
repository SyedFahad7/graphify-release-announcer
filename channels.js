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
 *
 * opts.combined = { tags, spanLabel, coverNote } when spanning multiple releases.
 */
function buildChannels(release, content, { forPosting = false, combined = null } = {}) {
  const tag = release.tag;
  const results = [];
  const coverNote = combined?.coverNote || '';
  const prodTitle = combined
    ? `${P()} ${combined.spanLabel} is now live`
    : `${P()} ${tag} is now live`;

  // 1) Production — the full post (stable releases).
  results.push({
    key: 'production',
    label: 'Production Releases',
    channel: '#production-releases',
    applicable: !release.prerelease,
    text: buildAnnouncement(release, content, {
      forPosting,
      roleName: 'Production Releases',
      title: prodTitle,
      coverNote,
    }),
  });

  // 2) Feature — only the exciting stuff (highlights + new features + integrations).
  const featureKeys = ['highlights', 'new_features', 'services', 'notes'];
  const featureContent = pick(content, featureKeys);
  results.push({
    key: 'feature',
    label: 'Feature Releases',
    channel: '#feature-releases',
    applicable: count(content, ['highlights', 'new_features', 'services']) > 0,
    text: buildAnnouncement(release, featureContent, {
      forPosting,
      roleName: 'Feature Releases',
      title: combined
        ? `What's new in ${P()} ${combined.spanLabel}`
        : `What's new in ${P()} ${tag}`,
      showHighlights: false,
      coverNote,
    }),
  });

  // 3) Security — only when the release has security fixes.
  const securityContent = pick(content, ['security', 'notes']);
  results.push({
    key: 'security',
    label: 'Security',
    channel: '#security',
    applicable: count(content, ['security']) > 0,
    text: buildAnnouncement(release, securityContent, {
      forPosting,
      roleName: 'Security',
      title: combined
        ? `Security updates in ${P()} ${combined.spanLabel} (upgrade recommended)`
        : `Security update in ${P()} ${tag} (upgrade recommended)`,
      showHighlights: false,
      includeInstall: true,
      coverNote,
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
      title: combined
        ? `${P()} ${combined.spanLabel} (beta) is ready for testing`
        : `${P()} ${tag} (beta) is ready for testing`,
      coverNote,
    }),
  });

  return results;
}

module.exports = { buildChannels };
