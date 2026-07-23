const config = require('../config');

/**
 * High-potential Exa passes: news + personal blogs + deep semantic sweep.
 * Override entirely with EXA_QUERIES (pipe-separated plain queries → auto/deep mix).
 */
const DEFAULT_SEARCHES = [
  {
    query:
      'recent news or press about Graphify Labs or graphifyy open-source knowledge graph for AI coding assistants',
    category: 'news',
    type: 'auto',
    days: 14,
    numResults: 12,
  },
  {
    query:
      'personal blog or review of Graphify knowledge graph coding assistant graphifyy Safi Shamsi',
    category: 'personal site',
    type: 'deep-lite',
    days: 21,
    numResults: 12,
  },
  {
    query:
      'developers writing about using Graphify or graphifyy on their codebase Claude Code Cursor',
    type: 'deep',
    days: 21,
    numResults: 15,
  },
  {
    query:
      'Graphify GitHub stars YC S26 knowledge graph memory layer review tutorial comparison 2026',
    type: 'deep-lite',
    days: 21,
    numResults: 12,
  },
  {
    query: 'site:dev.to OR site:medium.com OR site:substack.com Graphify graphifyy knowledge graph',
    type: 'auto',
    days: 30,
    numResults: 10,
  },
];

/** Domains that are never "coverage" (fake site, mirrors, first-party, profile junk). */
const EXCLUDE_DOMAINS = [
  'graphify.net',
  'graphify.com',
  'graphifylabs.ai',
  'graphifydesign.vercel.app',
  'newreleases.io',
  'libraries.io',
  'linkedin.com',
  'x.com',
  'twitter.com',
  'pypi.org',
];

function looksLikeGraphify(text) {
  const t = String(text || '');
  return /graphifyy?\b|graphify\s*labs|safi\s*shamsi|\/graphify/i.test(t);
}

function hostOf(u) {
  try {
    return new URL(u).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

/** Official / first-party / junk URLs — not third-party coverage. */
function isFirstPartyUrl(u) {
  try {
    const host = hostOf(u);
    const path = new URL(u).pathname.toLowerCase();
    if (EXCLUDE_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`))) return true;
    if (/github\.com$/i.test(host) && /\/(graphify-labs|safishamsi)\/graphify\/?$/i.test(path)) {
      return true;
    }
    if (/github\.com$/i.test(host) && /\/(graphify-labs|safishamsi)\/graphify\/(releases|tree|blob|commit)\b/i.test(path)) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

function normalizeUrl(u) {
  try {
    const url = new URL(u);
    url.hash = '';
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'ref'].forEach((k) =>
      url.searchParams.delete(k)
    );
    return url.toString().replace(/\/$/, '');
  } catch {
    return String(u || '').trim();
  }
}

function parsePublished(r) {
  const raw = r.publishedDate || r.published_date || r.published || null;
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

function ageDays(iso) {
  if (!iso) return null;
  const n = (Date.now() - new Date(iso).getTime()) / 86400000;
  return Number.isFinite(n) ? n : null;
}

function scoreByAge(days) {
  if (days == null) return 58; // unknown date → demote
  if (days < 1) return 96;
  if (days < 3) return 92;
  if (days < 7) return 86;
  if (days < 14) return 78;
  if (days < 21) return 70;
  if (days < 30) return 62;
  return 48;
}

function resultToSignal(r, search) {
  const url = normalizeUrl(r.url || r.id || '');
  if (!url || isFirstPartyUrl(url)) return null;

  const title = (r.title || 'Web mention').trim();
  // Skip empty/useless titles ("Medium", bare host pages)
  if (/^(medium|linkedin|github|home|untitled)$/i.test(title)) return null;

  const summary = (r.text || r.snippet || (Array.isArray(r.highlights) ? r.highlights.join(' ') : '') || title)
    .trim()
    .slice(0, 500);
  const blob = `${title} ${summary} ${url}`;
  if (!looksLikeGraphify(blob)) return null;

  const published = parsePublished(r);
  const days = ageDays(published);
  const maxDays = search.days || config.exaDaysLookback;
  if (days != null && days > maxDays) return null;

  const host = hostOf(url) || 'web';
  const score = scoreByAge(days);

  return {
    id: `news:exa:${Buffer.from(url).toString('base64url').slice(0, 48)}`,
    type: 'news',
    title: `${host}: ${title}`.slice(0, 140),
    summary,
    url,
    score,
    meta: {
      source: 'exa',
      query: search.query,
      category: search.category || null,
      searchType: search.type || 'auto',
      publishedAt: published,
      host,
      author: r.author || null,
      ageDays: days != null ? Math.round(days * 10) / 10 : null,
    },
  };
}

function buildSearches() {
  if (config.exaQueries.length) {
    return config.exaQueries.map((query, i) => ({
      query,
      type: i % 2 === 0 ? 'deep-lite' : 'auto',
      days: config.exaDaysLookback,
      numResults: config.exaNumResults,
    }));
  }
  return DEFAULT_SEARCHES.map((s) => ({
    ...s,
    numResults: Math.max(s.numResults || 10, config.exaNumResults),
    days: s.days || config.exaDaysLookback,
  }));
}

async function runExaSearch(search) {
  const start = new Date(Date.now() - (search.days || 21) * 86400000).toISOString();
  const body = {
    query: search.query,
    type: search.type || config.exaSearchType || 'auto',
    numResults: Math.min(Math.max(search.numResults || config.exaNumResults, 5), 25),
    startPublishedDate: start,
    excludeDomains: EXCLUDE_DOMAINS,
    contents: {
      text: { maxCharacters: 700 },
      highlights: { maxCharacters: 400 },
    },
  };
  if (search.category) body.category = search.category;

  const res = await fetch('https://api.exa.ai/search', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': config.exaApiKey,
      // Some Exa accounts accept Bearer; x-api-key is the common path
      authorization: `Bearer ${config.exaApiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new Error(`exa ${res.status}: ${errBody.slice(0, 140)}`);
  }

  const data = await res.json();
  return data.results || data.data || [];
}

/**
 * Live Exa web search for Graphify coverage (needs EXA_API_KEY).
 * Multi-pass: news vertical + personal blogs + deep semantic.
 * https://docs.exa.ai/reference/search
 */
async function fetchExaSignals() {
  if (!config.exaApiKey) {
    return { ok: false, error: 'EXA_API_KEY not set', signals: [], results: [] };
  }

  const searches = buildSearches();
  const signals = [];
  const errors = [];
  const raw = [];

  const settled = await Promise.allSettled(searches.map((s) => runExaSearch(s)));

  settled.forEach((outcome, i) => {
    const search = searches[i];
    if (outcome.status === 'rejected') {
      errors.push(outcome.reason?.message || String(outcome.reason));
      return;
    }
    for (const r of outcome.value) {
      raw.push(r);
      const sig = resultToSignal(r, search);
      if (sig) signals.push(sig);
    }
  });

  const seen = new Set();
  const deduped = signals
    .filter((s) => {
      const key = normalizeUrl(s.url);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => (b.score || 0) - (a.score || 0));

  return {
    ok: errors.length === 0 || deduped.length > 0,
    error: errors.length ? errors.join(' · ') : null,
    signals: deduped,
    resultCount: raw.length,
    searchCount: searches.length,
  };
}

module.exports = {
  fetchExaSignals,
  normalizeUrl,
  looksLikeGraphify,
  isFirstPartyUrl,
  EXCLUDE_DOMAINS,
  DEFAULT_SEARCHES,
};
