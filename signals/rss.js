const config = require('../config');
const { looksLikeGraphify, normalizeUrl, isFirstPartyUrl } = require('./exa');

/**
 * Default feeds that surface Graphify / OSS AI tooling mentions.
 * Override with ANNOUNCE_RSS_FEEDS (comma-separated URLs).
 */
const DEFAULT_FEEDS = [
  // Google News search RSS
  'https://news.google.com/rss/search?q=%22Graphify%22%20OR%20graphifyy%20OR%20%22Graphify%20Labs%22&hl=en-US&gl=US&ceid=US:en',
  // Hacker News keyword feed
  'https://hnrss.org/newest?q=Graphify',
  'https://hnrss.org/newest?q=graphifyy',
];

function decodeXml(s) {
  return String(s || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .trim();
}

function tagText(block, tag) {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i');
  const m = block.match(re);
  return m ? decodeXml(m[1]) : '';
}

function parseRssItems(xml) {
  const items = [];
  const chunks = String(xml || '').split(/<item[\s>]/i).slice(1);
  for (const chunk of chunks) {
    const body = chunk.split(/<\/item>/i)[0];
    const title = tagText(body, 'title');
    let link = tagText(body, 'link');
    // Atom-style / google news sometimes uses <link href="..."/>
    if (!link) {
      const href = body.match(/<link[^>]+href=["']([^"']+)["']/i);
      if (href) link = decodeXml(href[1]);
    }
    // Google News: guid often is the URL
    if (!link) link = tagText(body, 'guid');
    const description = tagText(body, 'description').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    const pubDate = tagText(body, 'pubDate') || tagText(body, 'published');
    if (!title && !link) continue;
    items.push({ title, link: normalizeUrl(link), description, pubDate });
  }
  return items;
}

function itemToSignal(item, feedUrl) {
  const url = item.link;
  if (!url || isFirstPartyUrl(url)) return null;
  const blob = `${item.title} ${item.description} ${url}`;
  // Keyword-scoped feeds already searched for Graphify; still require a hint in title/body when possible.
  const feedScoped = /graphify|graphifyy|news\.google\.com\/rss\/search|hnrss\.org/i.test(feedUrl);
  if (!looksLikeGraphify(blob) && !feedScoped) return null;
  if (!looksLikeGraphify(blob) && feedScoped && !/graphify|graphifyy|shamsi/i.test(blob)) {
    // Drop obvious noise from broad HN keyword collisions
    if (/hnrss\.org/i.test(feedUrl)) return null;
  }

  let score = 68;
  if (item.pubDate) {
    const ageDays = (Date.now() - new Date(item.pubDate).getTime()) / 86400000;
    if (Number.isFinite(ageDays)) {
      if (ageDays < 2) score = 86;
      else if (ageDays < 10) score = 76;
      else if (ageDays > 45) score = 50;
    }
  }

  let host = 'rss';
  try {
    host = new URL(url).hostname.replace(/^www\./, '');
  } catch {
    /* ignore */
  }
  if (/news\.google\.com/i.test(host)) host = 'Google News';
  if (/news\.ycombinator\.com/i.test(host)) host = 'Hacker News';

  return {
    id: `news:rss:${Buffer.from(url).toString('base64url').slice(0, 48)}`,
    type: 'news',
    title: `${host}: ${item.title || 'Mention'}`.slice(0, 120),
    summary: (item.description || item.title || '').slice(0, 500),
    url,
    score,
    meta: {
      source: 'rss',
      feed: feedUrl,
      publishedAt: item.pubDate || null,
      host,
    },
  };
}

async function fetchFeed(feedUrl) {
  try {
    const res = await fetch(feedUrl, {
      headers: {
        'user-agent':
          'Mozilla/5.0 (compatible; graphify-release-announcer/1.0; +https://graphify.com)',
        accept: 'application/rss+xml, application/xml, text/xml, */*',
      },
      redirect: 'follow',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const xml = await res.text();
    return parseRssItems(xml);
  } catch (err) {
    const cause = err.cause?.code || err.cause?.message || err.code || err.message;
    throw new Error(`${cause} · ${feedUrl.slice(0, 48)}`);
  }
}

/**
 * Pull Graphify mentions from RSS (Google News + HN by default).
 */
async function fetchRssSignals() {
  const feeds = config.rssFeeds.length ? config.rssFeeds : DEFAULT_FEEDS;
  const signals = [];
  const errors = [];
  let itemCount = 0;

  await Promise.all(
    feeds.map(async (feedUrl) => {
      try {
        const items = await fetchFeed(feedUrl);
        itemCount += items.length;
        for (const item of items.slice(0, config.rssMaxPerFeed)) {
          const sig = itemToSignal(item, feedUrl);
          if (sig) signals.push(sig);
        }
      } catch (err) {
        errors.push(`rss: ${err.message}`);
      }
    })
  );

  const seen = new Set();
  const deduped = signals.filter((s) => {
    const key = normalizeUrl(s.url);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return {
    ok: deduped.length > 0 || errors.length === 0,
    error: errors.length ? errors.join(' · ') : null,
    signals: deduped,
    itemCount,
    feedCount: feeds.length,
  };
}

module.exports = { fetchRssSignals, parseRssItems, DEFAULT_FEEDS };
