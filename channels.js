const config = require('./config');
const { emptySections } = require('./parse');
const { buildAnnouncementDetailed, chunkForDiscord } = require('./format');

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

function makePost(key, label, channel, applicable, release, content, announceOpts) {
  const built = buildAnnouncementDetailed(release, content, announceOpts);
  const chunks = chunkForDiscord(built.text);
  return {
    key,
    label,
    channel,
    applicable,
    text: built.text,
    length: built.length,
    trimmed: built.trimmed,
    chunks: chunks.length > 1 ? chunks : null,
  };
}

/**
 * From one release + grouped content, produce a post per channel.
 * Returns [{ key, label, channel, applicable, text, chunks? }].
 *
 * opts.combined = { tags, spanLabel, coverNote, releaseLinks }
 * opts.fitLimit = override Discord auto-trim (0 = keep full text)
 */
function buildChannels(release, content, { forPosting = false, combined = null, fitLimit } = {}) {
  const tag = release.tag;
  const results = [];
  const coverNote = combined?.coverNote || '';
  const releaseLinks = combined?.releaseLinks || null;
  const prodTitle = combined
    ? `${P()} ${combined.spanLabel} is now live`
    : `${P()} ${tag} is now live`;
  const base = {
    forPosting,
    coverNote,
    releaseLinks,
    ...(fitLimit != null ? { fitLimit } : {}),
  };

  results.push(
    makePost('production', 'Production Releases', '#production-releases', !release.prerelease, release, content, {
      ...base,
      roleName: 'Production Releases',
      title: prodTitle,
    })
  );

  const featureKeys = ['highlights', 'new_features', 'services', 'notes'];
  const featureContent = pick(content, featureKeys);
  results.push(
    makePost(
      'feature',
      'Feature Releases',
      '#feature-releases',
      count(content, ['highlights', 'new_features', 'services']) > 0,
      release,
      featureContent,
      {
        ...base,
        roleName: 'Feature Releases',
        title: combined
          ? `What's new in ${P()} ${combined.spanLabel}`
          : `What's new in ${P()} ${tag}`,
        showHighlights: false,
      }
    )
  );

  const securityContent = pick(content, ['security', 'notes']);
  results.push(
    makePost(
      'security',
      'Security',
      '#security',
      count(content, ['security']) > 0,
      release,
      securityContent,
      {
        ...base,
        roleName: 'Security',
        title: combined
          ? `Security updates in ${P()} ${combined.spanLabel} (upgrade recommended)`
          : `Security update in ${P()} ${tag} (upgrade recommended)`,
        showHighlights: false,
        includeInstall: true,
      }
    )
  );

  results.push(
    makePost('beta', 'Beta / Prerelease', '#beta', Boolean(release.prerelease), release, content, {
      ...base,
      roleName: 'Beta Testers',
      title: combined
        ? `${P()} ${combined.spanLabel} (beta) is ready for testing`
        : `${P()} ${tag} (beta) is ready for testing`,
    })
  );

  return results;
}

module.exports = { buildChannels };
