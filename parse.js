const config = require('./config');

// Humanize: swap the AI-slop em-dash "—" for a comma so posts don't read like AI
// wrote them. We only touch em-dashes (U+2014), never hyphens in compound words
// (per-file, path/username) or en-dashes used for ranges.
function deSlop(s) {
  return s
    .replace(/\s*—\s*/g, ', ')
    .replace(/\s+([,.;:])/g, '$1')
    .replace(/,\s*,/g, ',')
    .replace(/\s+/g, ' ')
    .trim();
}

// Canonical output buckets, in render order. Keep in sync with format.js.
// `notes` is rendered separately (as a quote block), always last.
const SECTION_ORDER = [
  'highlights',
  'new_features',
  'bug_fixes',
  'security',
  'breaking',
  'services',
  'other',
  'notes',
];

function emptySections() {
  return {
    highlights: [],
    new_features: [],
    bug_fixes: [],
    security: [],
    breaking: [],
    services: [],
    other: [],
    notes: [],
  };
}

// Map a `## Heading` to a canonical bucket by keyword.
function headingToBucket(heading) {
  const h = heading.toLowerCase().trim();
  if (/^note/.test(h)) return 'notes'; // "Note", "Notes", "Note for Cloud Users"
  if (/highlight/.test(h)) return 'highlights';
  if (/(security|cve|vulnerab)/.test(h)) return 'security';
  if (/(break|deprecat)/.test(h)) return 'breaking';
  if (/(service|template|integration|export|one[- ]?click)/.test(h)) return 'services';
  if (/(fix|bug|patch)/.test(h)) return 'bug_fixes';
  if (/(feature|new|added|improv|enhanc)/.test(h)) return 'new_features';
  return null; // unknown -> decide per-bullet
}

// Detect a bucket from a bullet's own leading token ("Fix:", "New:", ...).
function bulletToBucket(text) {
  const t = text.toLowerCase().trimStart();
  if (/^(security)\b/.test(t)) return 'security';
  if (/^(deprecat|breaking|removed?)\b/.test(t)) return 'breaking';
  if (/^(fix(ed|es)?|bug|hotfix)\b/.test(t)) return 'bug_fixes';
  if (/^(feat(ure)?|new|add(ed|s)?|support)\b/.test(t)) return 'new_features';
  return null;
}

// Strip a leading category LABEL like "Fix:", "New Feature -", "Security —".
// Requires a trailing separator so real sentences ("Removed the old command") keep their verb.
function stripLeadingToken(text) {
  return text.replace(
    /^\s*(fix(ed|es)?|bug|hotfix|feat(ure)?|new(\s+feature)?|add(ed|s)?|security|deprecat(e|ed|ion)?|breaking(\s+change)?|removed?)\s*[:\-–—]\s*/i,
    ''
  );
}

// Clean a raw markdown bullet into a Discord-friendly line.
function cleanBullet(raw) {
  let t = raw.trim();
  t = t.replace(/^[-*]\s+/, ''); // list marker
  // Leading **bold** — unwrap it so the sentence flows naturally (no injected
  // "Title —" em-dash slop). Only when the author used an explicit separator
  // ("**Title:** rest" / "**Title** - rest") do we keep a plain colon.
  t = t.replace(/^\*\*(.+?)\*\*(\s*[:\-–—]\s+)?/, (_, title, sep) => {
    const clean = title.trim();
    return sep ? `${clean}: ` : `${clean} `;
  });

  if (config.cleanStyle) {
    // Drop parentheticals that only reference issues/PRs or thank contributors,
    // e.g. "(#1873 / #1887, thanks @Alwyn93)" or "(#1899)" — but keep real ones
    // like "(successor of Nixpacks)".
    t = t.replace(/\s*\([^()]*(?:#\d+|thanks|thx|\bPR\b)[^()]*\)/gi, '');
    // Any stray "thanks @x" or "#123" left outside parens.
    t = t.replace(/[;,]?\s*thanks?\s+@[\w-]+(?:['’]s)?/gi, '');
    t = t.replace(/\s*#\d+/g, '');
    t = t.replace(/\s+([.,;:])/g, '$1'); // space before punctuation
    t = t.replace(/[;,]\s*$/g, ''); // dangling separators
  }

  t = t.replace(/\s+/g, ' ').trim();
  t = t.replace(/\s+[—–-]\s*$/, '').trim(); // dangling trailing dash from title join
  return deSlop(t);
}

// Collect any (#123) issue/PR numbers to help dedupe across sections.
function issueRefs(text) {
  return (text.match(/#(\d+)/g) || []).map((s) => s.slice(1));
}

/**
 * Deterministically turn a release body (markdown) into { intro, sections }.
 * Used as the fallback when no ANTHROPIC_API_KEY is configured.
 */
function parseReleaseBody(body) {
  const sections = emptySections();
  const lines = (body || '').split(/\r?\n/);

  const introLines = [];
  let currentBucketFromHeading = null;
  let sawHeading = false;
  const seenIssues = new Set();
  const seenText = new Set();

  for (const line of lines) {
    const headingMatch = line.match(/^#{1,6}\s+(.*)$/);
    if (headingMatch) {
      sawHeading = true;
      currentBucketFromHeading = headingToBucket(headingMatch[1]);
      continue;
    }

    const bulletMatch = line.match(/^\s*[-*]\s+(.+)$/);
    if (bulletMatch) {
      const rawItem = bulletMatch[1];
      const bucket =
        bulletToBucket(rawItem) || currentBucketFromHeading || 'other';
      let text = cleanBullet(rawItem);
      // If it fell through a heading bucket, still strip a redundant token.
      if (bulletToBucket(rawItem)) text = cleanBullet(stripLeadingToken(rawItem));
      if (!text) continue;

      // Dedupe: skip if we've already added an item for the same issue/PR,
      // or a near-identical line (handles Highlights vs All-fixes overlap).
      const refs = issueRefs(rawItem);
      if (refs.some((r) => seenIssues.has(r))) continue;
      const norm = text.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 60);
      if (seenText.has(norm)) continue;

      refs.forEach((r) => seenIssues.add(r));
      seenText.add(norm);
      sections[bucket].push(text);
      continue;
    }

    // Prose before the first heading becomes the intro paragraph.
    if (!sawHeading && line.trim()) {
      introLines.push(line.trim());
      continue;
    }
    // Prose under a "Note" heading (Coolify writes notes as paragraphs, not bullets).
    if (currentBucketFromHeading === 'notes' && line.trim()) {
      sections.notes.push(line.trim().replace(/\s+/g, ' '));
    }
  }

  const intro = deSlop(introLines.join(' '));
  return { intro, sections };
}

module.exports = { parseReleaseBody, SECTION_ORDER, emptySections, deSlop };
