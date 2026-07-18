const config = require('../config');

const API_BASE = 'https://api.twitter.com/2';

function headers() {
  const token = config.twitterBearerToken;
  if (!token) throw new Error('TWITTER_BEARER_TOKEN is not set');
  return { Authorization: `Bearer ${token}` };
}

async function twFetch(path) {
  const res = await fetch(`${API_BASE}${path}`, { headers: headers() });
  const text = await res.text();
  if (res.status === 402) {
    throw new Error(`Twitter API credits depleted (402): ${text.slice(0, 200)}`);
  }
  if (res.status === 429) {
    throw new Error('Twitter API rate limited (429). Try again shortly.');
  }
  if (!res.ok) {
    throw new Error(`Twitter API ${res.status}: ${text.slice(0, 200)}`);
  }
  return JSON.parse(text);
}

async function resolveUsername(username) {
  const clean = String(username || '')
    .trim()
    .replace(/^@/, '');
  if (!clean) return null;
  const data = await twFetch(`/users/by/username/${encodeURIComponent(clean)}`);
  return data?.data?.id || null;
}

async function fetchRecentTweets(userId, { maxResults = 8 } = {}) {
  const limit = Math.max(5, Math.min(maxResults, 100));
  const params = new URLSearchParams({
    max_results: String(limit),
    'tweet.fields': 'created_at,text,public_metrics',
    exclude: 'retweets,replies',
  });
  const data = await twFetch(`/users/${userId}/tweets?${params}`);
  return (data.data || []).map((tw) => ({
    id: tw.id,
    text: tw.text || '',
    createdAt: tw.created_at || null,
    metrics: tw.public_metrics || null,
  }));
}

/**
 * Fetch recent original tweets for configured announce handles.
 * Returns [{ handle, userId, tweets }]. Soft-fails per handle.
 */
async function fetchAnnounceTweets() {
  if (!config.twitterBearerToken) {
    return { ok: false, error: 'TWITTER_BEARER_TOKEN not set', handles: [] };
  }

  const handles = [];
  for (const handle of config.announceHandles) {
    try {
      const userId = await resolveUsername(handle);
      if (!userId) {
        handles.push({ handle, error: 'could not resolve', tweets: [] });
        continue;
      }
      const tweets = await fetchRecentTweets(userId, {
        maxResults: config.tweetsPerHandle,
      });
      handles.push({ handle, userId, tweets });
    } catch (err) {
      handles.push({ handle, error: err.message, tweets: [] });
    }
  }
  return { ok: true, handles };
}

function tweetUrl(handle, id) {
  return `https://x.com/${handle}/status/${id}`;
}

module.exports = {
  resolveUsername,
  fetchRecentTweets,
  fetchAnnounceTweets,
  tweetUrl,
};
