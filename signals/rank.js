const { tweetUrl } = require('./twitter');

// Product / company keywords for Safi timeline (founder posts a mix of product + personal).
const PRODUCT_RE =
  /\b(graphify|graphifyy|yc|open.?source|github|stars?|release|ship(ped|ping)?|pypi|pip install|claude|codex|cursor|mcp|knowledge.?graph|enterprise|benchmark|download|oss|launch|announc)/i;

const PERSONAL_RE =
  /\b(gym|jacked|workout|selfie|vacation|holiday|birthday|dinner|family|football|soccer|nba|cricket)\b/i;

const SKIP_START_RE = /^(@\w+\s+){1,}/;

/**
 * Score a tweet for the #announcements queue.
 * Company @graphify account: keep almost everything (already filtered RT/replies).
 * Founder @safishamsii: product-relevant only.
 */
function rankTweet(handle, tweet) {
  const text = (tweet.text || '').trim();
  if (!text) return null;

  const h = handle.toLowerCase();
  const isCompany = h === 'graphify' || h === 'graphifyy';

  if (PERSONAL_RE.test(text) && !PRODUCT_RE.test(text)) return null;

  let score = 40;
  if (isCompany) {
    score = 70;
  } else {
    // Founder: require product signal unless it's a short celebratory Graphify tag.
    if (!PRODUCT_RE.test(text)) return null;
    score = 75;
    if (SKIP_START_RE.test(text) && text.length < 80) score -= 15;
  }

  if (/\b(star|stars|k\b|download|release|shipped|launch|raised|funding)\b/i.test(text)) {
    score += 15;
  }
  if ((tweet.metrics?.like_count || 0) > 50) score += 5;
  if ((tweet.metrics?.retweet_count || 0) > 10) score += 5;

  return {
    id: `tweet:${tweet.id}`,
    type: 'tweet',
    title: `@${handle}: ${text.slice(0, 72)}${text.length > 72 ? '…' : ''}`,
    summary: text,
    url: tweetUrl(handle, tweet.id),
    score,
    meta: {
      handle,
      tweetId: tweet.id,
      createdAt: tweet.createdAt,
      metrics: tweet.metrics,
    },
  };
}

function tweetsToSignals(handlesPayload) {
  const signals = [];
  for (const row of handlesPayload.handles || []) {
    if (!row.tweets) continue;
    for (const tw of row.tweets) {
      const signal = rankTweet(row.handle, tw);
      if (signal) signals.push(signal);
    }
  }
  return signals;
}

module.exports = { rankTweet, tweetsToSignals, PRODUCT_RE };
