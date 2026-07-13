const config = require('./config');

const API = 'https://api.github.com';

function headers() {
  const h = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'graphify-release-announcer',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (config.githubToken) h.Authorization = `Bearer ${config.githubToken}`;
  return h;
}

async function ghFetch(path) {
  const res = await fetch(`${API}${path}`, { headers: headers() });
  if (res.status === 403 && res.headers.get('x-ratelimit-remaining') === '0') {
    throw new Error(
      'GitHub rate limit hit (60/hr anon). Set GITHUB_TOKEN in .env to raise it.'
    );
  }
  if (res.status === 404) {
    throw new Error(`Not found: ${path} (check GITHUB_REPO=${config.githubRepo}).`);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`GitHub API ${res.status} for ${path}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

function normalize(release) {
  return {
    tag: release.tag_name,
    name: release.name || release.tag_name,
    body: release.body || '',
    url: release.html_url,
    prerelease: release.prerelease,
    draft: release.draft,
    publishedAt: release.published_at,
    author: release.author?.login || null,
  };
}

/** Latest published, non-draft, non-prerelease release. */
async function getLatestRelease() {
  const release = await ghFetch(`/repos/${config.githubRepo}/releases/latest`);
  return normalize(release);
}

/** A specific release by tag, e.g. "v0.9.14". */
async function getReleaseByTag(tag) {
  const release = await ghFetch(
    `/repos/${config.githubRepo}/releases/tags/${encodeURIComponent(tag)}`
  );
  return normalize(release);
}

/** Most recent N releases (includes drafts/prereleases the token can see). */
async function listReleases(perPage = 10) {
  const releases = await ghFetch(
    `/repos/${config.githubRepo}/releases?per_page=${perPage}`
  );
  return releases.map(normalize);
}

/** Load a release from a saved GitHub release JSON file (offline / testing). */
function getReleaseFromFile(filePath) {
  const fs = require('fs');
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  return normalize(raw);
}

module.exports = {
  getLatestRelease,
  getReleaseByTag,
  listReleases,
  getReleaseFromFile,
};
