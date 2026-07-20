const fs = require('fs');
const path = require('path');

const CANON_DIR_CANDIDATES = [
  path.join(process.cwd(), 'brand', 'canon'),
  path.join(__dirname, '..', 'brand', 'canon'),
  path.join(__dirname, 'brand', 'canon'),
];

function resolveCanonDir() {
  for (const dir of CANON_DIR_CANDIDATES) {
    if (fs.existsSync(path.join(dir, 'facts.json'))) return dir;
  }
  return CANON_DIR_CANDIDATES[0];
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function readText(file, fallback = '') {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return fallback;
  }
}

/**
 * Load shipped canon pack (facts + voice + lessons).
 */
function loadCanon() {
  const dir = resolveCanonDir();
  const facts = readJson(path.join(dir, 'facts.json'), {
    firstPublicAt: '2026-04-03',
    pypiPackage: 'graphifyy',
    githubRepo: 'Graphify-Labs/graphify',
    githubUrl: 'https://github.com/Graphify-Labs/graphify',
    ycBatch: 'S26',
    preferSkipOriginStory: true,
    ctaPolicy: { milestones: 'thank_only' },
    neverClaim: [],
    bannedHardSellPatterns: [],
  });
  const voice = readText(path.join(dir, 'voice.md'), '');
  const lessons = readJson(path.join(dir, 'lessons.json'), []);
  return { facts, voice, lessons, dir };
}

/**
 * Months since firstPublicAt (calendar-ish, floor).
 */
function monthsSinceLaunch(facts, now = new Date()) {
  const start = new Date(`${facts.firstPublicAt || '2026-04-03'}T00:00:00Z`);
  if (Number.isNaN(start.getTime())) return 0;
  const end = now instanceof Date ? now : new Date(now);
  let months =
    (end.getUTCFullYear() - start.getUTCFullYear()) * 12 +
    (end.getUTCMonth() - start.getUTCMonth());
  if (end.getUTCDate() < start.getUTCDate()) months -= 1;
  return Math.max(0, months);
}

/**
 * Human age label Claude may use — never says "a year" until >= 12 months.
 */
function projectAgeLabel(facts, now = new Date()) {
  const months = monthsSinceLaunch(facts, now);
  if (months < 1) return 'just weeks';
  if (months === 1) return 'about a month';
  if (months < 12) return `about ${months} months`;
  const years = Math.floor(months / 12);
  const rem = months % 12;
  if (rem === 0) return years === 1 ? 'about a year' : `about ${years} years`;
  return `about ${years} year${years > 1 ? 's' : ''} and ${rem} months`;
}

function lessonsFor(signalType, lessons) {
  const list = Array.isArray(lessons) ? lessons : [];
  return list.filter((l) => {
    const applies = l.appliesTo || ['*'];
    return applies.includes('*') || applies.includes(signalType) || applies.includes('image');
  });
}

/**
 * Compact block injected into Claude system/user prompts.
 */
function canonPromptBlock(options = {}) {
  const { signalType = '*', forImage = false } = options;
  const { facts, voice, lessons } = loadCanon();
  const age = projectAgeLabel(facts);
  const months = monthsSinceLaunch(facts);
  const relevant = lessonsFor(forImage ? 'image' : signalType, lessons);

  const lessonsMd = relevant.length
    ? relevant.map((l) => `- BAD: "${l.bad}" → ${l.rule}`).join('\n')
    : '- (none yet)';

  return `
## Graphify canon (authoritative — do not invent against this)

Facts:
- Product: ${facts.productName || 'Graphify'} (${facts.company || 'Graphify Labs'}, YC ${facts.ycBatch || 'S26'})
- PyPI: ${facts.pypiPackage || 'graphifyy'} (two y's)
- Repo: ${facts.githubRepo || 'Graphify-Labs/graphify'}
- First public: ${facts.firstPublicAt || '2026-04-03'} → project age NOW: **${age}** (${months} months)
- Origin: ${facts.originNote || 'Claude Code skill; public ~Apr 2026'}
- preferSkipOriginStory: ${facts.preferSkipOriginStory !== false}
- CTA milestones: ${facts.ctaPolicy?.milestones || 'thank_only'} (no star-begging)

Never claim / never write:
${(facts.neverClaim || []).map((c) => `- "${c}"`).join('\n') || '- (see lessons)'}

Lessons (past mistakes — do not repeat):
${lessonsMd}

${forImage ? 'For image copy: same age/CTA rules; never redraw logos.' : ''}

## Voice
${voice}
`.trim();
}

function softDeSlop(s) {
  return String(s || '')
    .replace(/\s*—\s*/g, ', ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Second-line validator: strip hard-sell / banned claims; return warnings.
 * @returns {{ text: string, warnings: string[] }}
 */
function validateAnnouncement(text, signal, canon) {
  const c = canon || loadCanon();
  const { facts, lessons } = c;
  const warnings = [];
  let t = softDeSlop(text);
  const age = projectAgeLabel(facts);
  const months = monthsSinceLaunch(facts);

  // Lessons: drop whole lines containing known bad phrases (avoid orphan punctuation).
  for (const lesson of lessons || []) {
    if (!lesson.bad) continue;
    const applies = lesson.appliesTo || ['*'];
    const type = signal?.type || '*';
    const ok =
      applies.includes('*') ||
      applies.includes(type) ||
      (type === 'image' && applies.includes('image'));
    if (!ok) continue;
    // Skip image-only lessons on text drafts
    if (applies.includes('image') && !applies.includes('*') && !applies.includes(type)) {
      continue;
    }
    const re = new RegExp(escapeRegExp(lesson.bad), 'i');
    if (!re.test(t)) continue;
    const lines = t.split('\n');
    const next = lines.filter((line) => !re.test(line));
    if (next.length !== lines.length) {
      t = next.join('\n');
      warnings.push(`Removed lesson match: ${lesson.id || lesson.bad.slice(0, 40)}`);
    }
  }

  // Timeline lies → computed age (only rewrite when under 12 months)
  if (months < 12) {
    const beforeAge = t;
    t = t.replace(/\b[Aa] year ago\b/g, 'A few months ago');
    t = t.replace(/\byears ago\b/gi, 'months ago');
    t = t.replace(/\bfor over a year\b/gi, `in just ${age}`);
    t = t.replace(/\bsince last year\b/gi, 'since we launched');
    t = t.replace(/\byears of work\b/gi, 'months of work');
    if (t !== beforeAge) warnings.push(`Adjusted timeline to match canon age (${age})`);
  }

  // neverClaim / hard-sell: drop whole lines that still contain them
  const banned = [
    ...(facts.neverClaim || []),
    ...(facts.bannedHardSellPatterns || []),
  ];
  for (const phrase of banned) {
    if (!phrase) continue;
    // Age phrases already rewritten; skip stripping "a year ago" residue handled above
    if (/year ago|years ago|over a year|last year|years of work/i.test(phrase)) continue;
    const re = new RegExp(escapeRegExp(phrase), 'i');
    if (!re.test(t)) continue;
    const lines = t.split('\n');
    const next = lines.filter((line) => !re.test(line));
    if (next.length !== lines.length) {
      t = next.join('\n');
      warnings.push(`Removed banned line ("${phrase}")`);
    } else {
      t = t.replace(new RegExp(escapeRegExp(phrase), 'gi'), '');
      warnings.push(`Stripped banned phrase ("${phrase}")`);
    }
  }

  // Extra hard-sell line killers
  const beforeSell = t;
  t = t.replace(
    /\n*(?:If you haven'?t yet[^.]*\.\s*)?(?:Drop a star|Smash a star|Leave a star|Star the repo)[^\n]*/gi,
    ''
  );
  t = t.replace(/\n*help us keep the momentum[^\n]*/gi, '');
  if (t !== beforeSell) warnings.push('Removed hard-sell close');

  // Milestone CTA policy: thank_only allows quiet "Repo: <url>" but not star-begging
  // or a naked GitHub URL used as a CTA. Never leave an empty "Repo:" label.
  if (signal?.type === 'milestone' && (facts.ctaPolicy?.milestones || 'thank_only') === 'thank_only') {
    const before = t;
    // Naked URL at end without Repo: prefix → remove
    t = t.replace(
      /\n+(?!Repo:\s*)https:\/\/github\.com\/Graphify-Labs\/graphify\/?\s*$/i,
      ''
    );
    // Star-begging line that also has the URL
    t = t.replace(
      /\n*(?:Star (?:us|the repo|Graphify)[^\n]*)\n?(?:https:\/\/github\.com\/Graphify-Labs\/graphify\/?\s*)?/gi,
      ''
    );
    if (t !== before) warnings.push('Removed star-begging CTA (thank_only policy)');
  }

  // Empty or incomplete Repo: lines
  const beforeRepo = t;
  t = t.replace(/\n*Repo:\s*$/gim, '');
  t = t.replace(/^Repo:\s*$/gim, '');
  // Normalize "Repo:" with missing URL → attach canon githubUrl if we have a signal url or facts
  const repoUrl = signal?.url || facts.githubUrl || '';
  if (repoUrl && !/^Repo:\s*https?:\/\//im.test(t) && signal?.type === 'milestone') {
    // only auto-append if draft clearly intended a repo line (had Repo: we stripped, or no link at all)
    if (beforeRepo !== t || (!/github\.com\/Graphify-Labs\/graphify/i.test(t) && beforeRepo.match(/Repo:/i))) {
      t = `${t.trim()}\n\nRepo: ${repoUrl}`;
      warnings.push('Filled quiet Repo: link from canon');
    }
  } else if (beforeRepo !== t) {
    warnings.push('Removed empty Repo: line');
  }

  // If text still claims "year" and we are under 12 months, strip those sentences
  if (months < 12 && /\b(a year ago|years ago|over a year|last year)\b/i.test(t)) {
    t = t
      .split('\n')
      .filter((line) => !/\b(a year ago|years ago|over a year|last year)\b/i.test(line))
      .join('\n');
    warnings.push('Removed under-age "year" timeline line');
  }

  // Drop leftover punctuation-only / filler lines
  t = t
    .split('\n')
    .filter((line) => !/^\s*[.:;,]+?\s*$/.test(line))
    .filter((line) => !/^\s*more coming soon\.?\s*$/i.test(line))
    .join('\n');

  t = t.replace(/\n{3,}/g, '\n\n').replace(/[ \t]+\n/g, '\n').trim();

  return { text: t, warnings: [...new Set(warnings)] };
}

function canonMeta() {
  const { facts } = loadCanon();
  return {
    firstPublicAt: facts.firstPublicAt,
    projectAgeLabel: projectAgeLabel(facts),
    monthsSinceLaunch: monthsSinceLaunch(facts),
    githubRepo: facts.githubRepo,
    pypiPackage: facts.pypiPackage,
  };
}

module.exports = {
  loadCanon,
  monthsSinceLaunch,
  projectAgeLabel,
  canonPromptBlock,
  validateAnnouncement,
  softDeSlop,
  canonMeta,
};
