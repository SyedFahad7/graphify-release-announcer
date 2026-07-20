const config = require('../config');

const DEFAULT_QUERIES = [
  'recent articles blogs or news about Graphify Labs open source knowledge graph coding assistant graphifyy',
  'Graphify GitHub stars Safi Shamsi YC S26 developer tools coverage',
];

function looksLikeGraphify(text) {
  const t = String(text || '');
  return /graphifyy?\b|graphify\s*labs|safi\s*shamsi|\/graphify/i.test(t);
}

/** Official / first-party URLs — not "coverage" for the news queue. */
function isFirstPartyUrl(u) {
  try {
    const host = new URL(u).hostname.replace(/^www\./, '').toLowerCase();
    const path = new URL(u).pathname.toLowerCase();
    if (/^(graphify\.com|graphifylabs\.ai|graphifydesign\.vercel\.app)$/i.test(host)) return true;
    if (/^(x\.com|twitter\.com)$/i.test(host) && /\/(graphify|safishamsii)\b/i.test(path)) return true;
    if (/github\.com$/i.test(host) && /\/(graphify-labs|safishamsi)\/graphify/i.test(path)) return true;
    if (/pypi\.org$/i.test(host) && /graphifyy/i.test(path)) return true;
    return false;
  } catch {
    return false;
  }
}

function normalizeUrl(u) {
  try {
    const url = new URL(u);
    url.hash = '';
    // strip common tracking
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'ref'].forEach((k) =>
      url.searchParams.delete(k)
    );
    return url.toString().replace(/\/$/, '');
  } catch {
    return String(u || '').trim();
  }
}

function resultToSignal(r, query) {
  const url = normalizeUrl(r.url || r.id || '');
  if (!url || isFirstPartyUrl(url)) return null;
  const title = (r.title || 'Web mention').trim();
  const summary = (r.text || r.snippet || r.highlights?.join(' ') || title).trim().slice(0, 500);
  const blob = `${title} ${summary} ${url}`;
  if (!looksLikeGraphify(blob)) return null;

  const published = r.publishedDate || r.published_date || null;
  let score = 70;
  if (published) {
    const ageDays = (Date.now() - new Date(published).getTime()) / 86400000;
    if (ageDays < 3) score = 88;
    else if (ageDays < 14) score = 78;
    else if (ageDays > 60) score = 55;
  }

  const host = (() => {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return 'web';
    }
  })();

  return {
    id: `news:exa:${Buffer.from(url).toString('base64url').slice(0, 48)}`,
    type: 'news',
    title: `${host}: ${title}`.slice(0, 120),
    summary,
    url,
    score,
    meta: {
      source: 'exa',
      query,
      publishedAt: published,
      host,
      author: r.author || null,
    },
  };
}

/**
 * Live Exa web search for Graphify coverage (needs EXA_API_KEY).
 * https://docs.exa.ai/reference/search
 */
async function fetchExaSignals() {
  if (!config.exaApiKey) {
    return { ok: false, error: 'EXA_API_KEY not set', signals: [], results: [] };
  }

  const queries = config.exaQueries.length ? config.exaQueries : DEFAULT_QUERIES;
  const signals = [];
  const errors = [];
  const raw = [];

  // Prefer last ~45 days of coverage
  const start = new Date(Date.now() - 45 * 86400000).toISOString().slice(0, 10);

  for (const query of queries) {
    try {
      const res = await fetch('https://api.exa.ai/search', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': config.exaApiKey,
        },
        body: JSON.stringify({
          query,
          type: 'auto',
          numResults: config.exaNumResults,
          startPublishedDate: `${start}T00:00:00.000Z`,
          contents: {
            text: { maxCharacters: 600 },
          },
        }),
      });

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        errors.push(`exa query failed ${res.status}: ${body.slice(0, 120)}`);
        continue;
      }

      const data = await res.json();
      const results = data.results || data.data || [];
      for (const r of results) {
        raw.push(r);
        const sig = resultToSignal(r, query);
        if (sig) signals.push(sig);
      }
    } catch (err) {
      errors.push(`exa: ${err.message}`);
    }
  }

  // Dedupe by URL
  const seen = new Set();
  const deduped = signals.filter((s) => {
    const key = normalizeUrl(s.url);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return {
    ok: errors.length === 0 || deduped.length > 0,
    error: errors.length ? errors.join(' · ') : null,
    signals: deduped,
    resultCount: raw.length,
  };
}

module.exports = { fetchExaSignals, normalizeUrl, looksLikeGraphify, isFirstPartyUrl };
