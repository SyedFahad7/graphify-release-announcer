const config = require('../config');

async function getStarCount() {
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'graphify-release-announcer',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (config.githubToken) headers.Authorization = `Bearer ${config.githubToken}`;

  const res = await fetch(`https://api.github.com/repos/${config.githubRepo}`, { headers });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`GitHub repo API ${res.status}: ${body.slice(0, 160)}`);
  }
  const data = await res.json();
  return {
    stars: Number(data.stargazers_count) || 0,
    url: data.html_url || `https://github.com/${config.githubRepo}`,
    fullName: data.full_name || config.githubRepo,
  };
}

/**
 * Crossed milestones at or below current star count (highest first).
 */
function crossedMilestones(stars, thresholds = config.starMilestones) {
  return thresholds.filter((m) => stars >= m).sort((a, b) => b - a);
}

/**
 * Build milestone signals for the announcements queue.
 */
async function milestoneSignals() {
  const { stars, url, fullName } = await getStarCount();
  const crossed = crossedMilestones(stars);
  const signals = crossed.map((milestone) => ({
    id: `stars:${milestone}`,
    type: 'milestone',
    title: `${milestone.toLocaleString()} GitHub stars`,
    summary: `${fullName} is at ${stars.toLocaleString()} stars (crossed ${milestone.toLocaleString()}).`,
    url,
    score: 100 + Math.floor(milestone / 1000),
    meta: { stars, milestone, fullName },
  }));
  return { stars, url, fullName, signals };
}

module.exports = { getStarCount, crossedMilestones, milestoneSignals };
