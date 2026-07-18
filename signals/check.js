const github = require('../github');
const { milestoneSignals } = require('./stars');
const { fetchAnnounceTweets } = require('./twitter');
const { tweetsToSignals } = require('./rank');

/**
 * Gather ranked announcement signals (stars, tweets, latest release teaser).
 */
async function checkSignals({ includeTwitter = true } = {}) {
  const errors = [];
  let signals = [];
  let starsInfo = null;
  let twitterInfo = null;

  try {
    starsInfo = await milestoneSignals();
    signals = signals.concat(starsInfo.signals);
  } catch (err) {
    errors.push(`stars: ${err.message}`);
  }

  if (includeTwitter) {
    try {
      twitterInfo = await fetchAnnounceTweets();
      if (!twitterInfo.ok) {
        errors.push(`twitter: ${twitterInfo.error}`);
      } else {
        for (const h of twitterInfo.handles) {
          if (h.error) errors.push(`twitter @${h.handle}: ${h.error}`);
        }
        signals = signals.concat(tweetsToSignals(twitterInfo));
      }
    } catch (err) {
      errors.push(`twitter: ${err.message}`);
    }
  }

  try {
    const latest = await github.getLatestRelease();
    signals.push({
      id: `release:${latest.tag}`,
      type: 'release',
      title: `${latest.name || latest.tag} is live`,
      summary:
        (latest.body || '')
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter(Boolean)
          .slice(0, 3)
          .join(' ')
          .slice(0, 400) || `Graphify ${latest.tag} shipped on GitHub.`,
      url: latest.url,
      score: 85,
      meta: {
        tag: latest.tag,
        publishedAt: latest.publishedAt,
        prerelease: latest.prerelease,
      },
    });
  } catch (err) {
    errors.push(`release: ${err.message}`);
  }

  signals.sort((a, b) => (b.score || 0) - (a.score || 0));

  // Deduplicate by id
  const seen = new Set();
  signals = signals.filter((s) => {
    if (seen.has(s.id)) return false;
    seen.add(s.id);
    return true;
  });

  return {
    checkedAt: new Date().toISOString(),
    stars: starsInfo
      ? { count: starsInfo.stars, url: starsInfo.url, fullName: starsInfo.fullName }
      : null,
    twitter: twitterInfo
      ? {
          ok: twitterInfo.ok,
          handles: (twitterInfo.handles || []).map((h) => ({
            handle: h.handle,
            tweetCount: (h.tweets || []).length,
            error: h.error || null,
          })),
        }
      : null,
    signals,
    errors,
  };
}

function findSignal(signals, id) {
  return (signals || []).find((s) => s.id === id) || null;
}

/**
 * Build a manual signal from a URL + optional note.
 */
function manualSignal({ url, note, title }) {
  const u = String(url || '').trim();
  let type = 'manual';
  let id = `manual:${Date.now()}`;
  let resolvedTitle = title || 'Manual announcement';

  const tweetMatch = u.match(/(?:x\.com|twitter\.com)\/(\w+)\/status\/(\d+)/i);
  if (tweetMatch) {
    type = 'tweet';
    id = `tweet:${tweetMatch[2]}`;
    resolvedTitle = title || `Tweet from @${tweetMatch[1]}`;
  }

  const releaseMatch = u.match(/github\.com\/[^/]+\/[^/]+\/releases\/tag\/([^/?#]+)/i);
  if (releaseMatch) {
    type = 'release';
    id = `release:${decodeURIComponent(releaseMatch[1])}`;
    resolvedTitle = title || `Release ${decodeURIComponent(releaseMatch[1])}`;
  }

  return {
    id,
    type,
    title: resolvedTitle,
    summary: note || u || resolvedTitle,
    url: u || null,
    score: 60,
    meta: { manual: true },
  };
}

module.exports = { checkSignals, findSignal, manualSignal };
