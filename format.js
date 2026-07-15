const config = require('./config');
const { SECTION_ORDER } = require('./parse');

const SECTION_META = {
  highlights: { emoji: '⭐', title: 'Highlights' },
  new_features: { emoji: '✨', title: 'New Features' },
  bug_fixes: { emoji: '🐛', title: 'Notable Bug Fixes' },
  security: { emoji: '🔒', title: 'Security Fixes' },
  breaking: { emoji: '⚠️', title: 'Breaking Changes & Deprecations' },
  services: { emoji: '🛠️', title: 'New Integrations & Exports' },
  other: { emoji: '📌', title: 'Other Improvements' },
};

const DISCORD_LIMIT = 2000;

// Two hand-tuned presets modelled on the two Coolify #production-releases admins:
//   peak   — big H1 title, "## Release Highlights" + stats subtext, bold emoji
//            section headers, flat bullets. (their "Peak" posts)
//   shadow — inline "@role — **title**" line, bold section labels with hollow
//            nested sub-bullets, no highlights heading. (their "ShadowArcanist" posts)
// Both close with the full-notes link in a quote block.
const THEMES = {
  peak: { headingStyle: 'h1', sectionStyle: 'headed', showHighlights: true, footerStyle: 'quote' },
  shadow: { headingStyle: 'inline', sectionStyle: 'nested', showHighlights: false, footerStyle: 'quote' },
};

function resolveTheme(opts) {
  const base = THEMES[opts.theme || config.postTheme] || THEMES.peak;
  return {
    headingStyle: opts.headingStyle || base.headingStyle,
    sectionStyle: opts.sectionStyle || base.sectionStyle,
    showHighlights: opts.showHighlights != null ? opts.showHighlights : base.showHighlights,
    footerStyle: opts.footerStyle || base.footerStyle,
  };
}

// Top "@role" line. Real ping (<@&id>) only when actually posting with a role id;
// otherwise a plain, non-pinging text mention safe to paste.
function mention(forPosting, roleName, roleId) {
  const name = roleName || config.roleName;
  const id = roleId || config.roleId;
  if (forPosting && id) return `<@&${id}>`;
  return `@${name}`;
}

function capItems(items) {
  const max = config.maxItemsPerSection;
  return max > 0 ? items.slice(0, max) : items;
}

// Peak-style: bold emoji header, flat bullets (• filled).
function renderSectionHeaded(key, items) {
  const meta = SECTION_META[key];
  const lines = capItems(items).map((i) => `- ${i}`);
  return `**${meta.emoji} ${meta.title}**\n${lines.join('\n')}`;
}

// Shadow-style: bold section label as a bullet, items nested one level so Discord
// renders them as hollow ◦ sub-bullets. No emoji, matching the admin's posts.
function renderSectionNested(key, items) {
  const meta = SECTION_META[key];
  const lines = capItems(items).map((i) => `  - ${i}`);
  return `- **${meta.title}**\n${lines.join('\n')}`;
}

function renderSections(sections, style) {
  const render = style === 'nested' ? renderSectionNested : renderSectionHeaded;
  return SECTION_ORDER.filter((k) => k !== 'notes')
    .filter((k) => sections[k] && sections[k].length)
    .map((k) => render(k, sections[k]));
}

// Small gray "-# 8 fixes · 2 new · 1 security" stat line under the highlights heading.
function statsSubtext(sections) {
  const bits = [];
  const add = (k, label) => {
    const n = sections[k] ? sections[k].length : 0;
    if (n) bits.push(`${n} ${label}`);
  };
  add('new_features', 'new');
  add('bug_fixes', 'fixes');
  add('security', 'security');
  add('breaking', 'breaking');
  add('services', 'integrations');
  return bits.length ? `-# ${bits.join(' · ')}` : null;
}

function installBlock(release) {
  const v = release.tag.replace(/^v/, '');
  return `**⬆️ Install / Upgrade**\n\`\`\`\npip install --upgrade ${config.pypiPackage}\n# or\nuv tool install ${config.pypiPackage}@${v}\n\`\`\``;
}

// Coolify's admins put "Notes" in their own block; we render it as a quote block.
function notesBlock(notes) {
  if (!notes || !notes.length) return null;
  const body = notes.map((n) => `> ${n}`).join('\n');
  return `> **📝 Note**\n${body}`;
}

function footerBlock(release, style) {
  const link = `Full release notes: ${release.url}`;
  return style === 'quote' ? `> 📝 ${link}` : `**📝 ${link}**`;
}

/**
 * Build an announcement.
 * @param {object} release normalized release (tag, name, url, ...)
 * @param {object} content { intro, sections }
 * @param {object} opts
 *   - forPosting {boolean}       role ping mention vs copy-paste text
 *   - theme {'peak'|'shadow'}    preset (default config.postTheme)
 *   - headingStyle {'h1'|'inline'}   override title style
 *   - sectionStyle {'headed'|'nested'}  override section style
 *   - showHighlights {boolean}   show the "## Release Highlights" heading
 *   - footerStyle {'quote'|'bold'}
 *   - roleName / roleId {string} per-channel role
 *   - title {string}             plain title text (default "X vY is now live")
 *   - highlightsHeading {string} default "Release Highlights"
 *   - includeInstall {boolean}   include install/upgrade block (default true)
 */
const TRIM_ORDER = ['other', 'services', 'bug_fixes', 'new_features', 'highlights'];

function renderAnnouncement(release, content, opts) {
  const t = resolveTheme(opts);
  const { intro, sections } = content;
  const forPosting = opts.forPosting || false;
  const emoji = config.releaseEmoji;
  const title = opts.title || `${config.productName} ${release.tag} is now live`;
  const men = mention(forPosting, opts.roleName, opts.roleId);
  const parts = [];

  if (t.headingStyle === 'inline') {
    parts.push(`${men} — **${title}** ${emoji}`.trim());
    if (intro) parts.push(intro);
  } else {
    parts.push(`# ${title} ${emoji}`.trim());
    parts.push(intro ? `${men} ${intro}` : men);
  }

  if (t.showHighlights) {
    const heading = opts.highlightsHeading || 'Release Highlights';
    const sub = statsSubtext(sections);
    parts.push(sub ? `## ${heading}\n${sub}` : `## ${heading}`);
  }

  const rendered = renderSections(sections, t.sectionStyle);
  if (rendered.length) parts.push(rendered.join('\n\n'));

  const notes = notesBlock(sections.notes);
  if (notes) parts.push(notes);

  if (opts.includeInstall !== false) parts.push(installBlock(release));

  parts.push(footerBlock(release, t.footerStyle));

  return parts.join('\n\n');
}

/**
 * Build an announcement, auto-trimming to fit one Discord message when needed.
 * Returns { text, length, trimmed } (trimmed = number of bullets dropped to fit).
 */
function buildAnnouncementDetailed(release, content, opts = {}) {
  // Back-compat: a boolean 3rd arg means { forPosting }.
  if (typeof opts === 'boolean') opts = { forPosting: opts };
  const limit = opts.fitLimit != null ? opts.fitLimit : config.fitLimit;

  const full = renderAnnouncement(release, content, opts);
  if (!limit || full.length <= limit) {
    return { text: full, length: full.length, trimmed: 0 };
  }

  // Work on a mutable copy; drop trailing bullets from the least-important
  // section until it fits. security/breaking/notes are protected.
  const sections = JSON.parse(JSON.stringify(content.sections));
  const working = { intro: content.intro, sections };
  let dropped = 0;
  let text = renderAnnouncement(release, working, opts);
  let guard = 0;
  while (text.length > limit && guard++ < 1000) {
    let popped = false;
    for (const key of TRIM_ORDER) {
      if (sections[key] && sections[key].length > 0) {
        sections[key].pop();
        dropped++;
        popped = true;
        break;
      }
    }
    if (!popped) break; // only protected sections left; can't trim further
    text = renderAnnouncement(release, working, opts);
  }
  return { text, length: text.length, trimmed: dropped };
}

function buildAnnouncement(release, content, opts = {}) {
  return buildAnnouncementDetailed(release, content, opts).text;
}

/**
 * Split a long announcement into <=2000 char chunks on paragraph boundaries so
 * it can be posted as consecutive Discord messages without breaking code blocks.
 */
function chunkForDiscord(text, limit = DISCORD_LIMIT) {
  if (text.length <= limit) return [text];
  const blocks = text.split('\n\n');
  const chunks = [];
  let cur = '';
  for (const block of blocks) {
    const candidate = cur ? `${cur}\n\n${block}` : block;
    if (candidate.length <= limit) {
      cur = candidate;
    } else {
      if (cur) chunks.push(cur);
      if (block.length <= limit) {
        cur = block;
      } else {
        // Single oversized block — hard-split on lines.
        let line = '';
        for (const l of block.split('\n')) {
          const c = line ? `${line}\n${l}` : l;
          if (c.length <= limit) line = c;
          else {
            if (line) chunks.push(line);
            line = l.slice(0, limit);
          }
        }
        cur = line;
      }
    }
  }
  if (cur) chunks.push(cur);
  return chunks;
}

module.exports = {
  buildAnnouncement,
  buildAnnouncementDetailed,
  chunkForDiscord,
  installBlock,
  SECTION_META,
};
