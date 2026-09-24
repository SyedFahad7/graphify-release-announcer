const config = require('../config');

function configured() {
  return Boolean(config.supabaseUrl && config.supabaseServiceKey);
}

function headers(extra = {}) {
  return {
    apikey: config.supabaseServiceKey,
    Authorization: `Bearer ${config.supabaseServiceKey}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

async function rest(path, options = {}) {
  if (!configured()) {
    throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY on Vercel.');
  }
  const res = await fetch(`${config.supabaseUrl}/rest/v1/${path}`, {
    ...options,
    headers: headers(options.headers),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Supabase ${res.status}: ${text.slice(0, 300)}`);
  }
  if (!text) return null;
  return JSON.parse(text);
}

async function listRecent() {
  return rest('release_drafts?select=tag,status,published_at&order=published_at.desc&limit=40');
}

async function listPending() {
  return rest(
    'release_drafts?status=eq.pending&select=tag,status,name,url,published_at,paste_text,source,created_at&order=published_at.asc'
  );
}

async function get(tag) {
  const rows = await rest(
    `release_drafts?tag=eq.${encodeURIComponent(tag)}&select=tag,status,post_text,paste_text&limit=1`
  );
  return rows?.[0] || null;
}

async function upsert(row) {
  await rest('release_drafts', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(row),
  });
}

module.exports = { configured, listRecent, listPending, get, upsert };
