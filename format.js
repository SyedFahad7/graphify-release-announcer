const config = require('./config');
const { SECTION_ORDER } = require('./parse');

const SECTION_META = {
  highlights: { emoji: '⭐', title: 'Highlights' },
  new_features: { emoji: '✨', title: 'New Features' },
  bug_fixes: { emoji: '🐛', title: 'Notable Bug Fixes' },
  security: { emoji: '🔒', title: 'Security Fixes' },
  breaking: { emoji: '⚠️', title: 'Breaking Changes & Deprecations' },
  services: { emoji: '🛠️', title: 'New Integrations / Exports' },
  other: { emoji: '📌', title: 'Other Improvements' },
};

const DISCORD_LIMIT = 2000;

// The top "@Production Releases" line. Uses a real role ping (<@&id>) when posting
// with a role id configured; otherwise a plain, non-pinging text mention.
function mentionLine(forPosting, roleName, roleId) {
  const name = roleName || config.roleName;
  const id = roleId || config.roleId;
  if (forPosting && id) return `<@&${id}>`;
  return `@${name}`;
}

function renderSection(key, items) {
  if (!items || items.length === 0) return null;
  const meta = SECTION_META[key];
  const max = config.maxItemsPerSection;
  const shown = items.slice(0, max);
  const lines = shown.map((i) => `- ${i}`);
  if (items.length > max) {
    lines.push(`- …and ${items.length - max} more`);
  }
  return `**${meta.emoji} ${meta.title}**\n${lines.join('\n')}`;
}

function installBlock(release) {
  return `**⬆️ Install / Upgrade**\n\`\`\`\npip install --upgrade ${config.pypiPackage}\n# or\nuv tool install ${config.pypiPackage}@${release.tag.replace(/^v/, '')}\n\`\`\``;
}

/**
 * Build an announcement.
 * @param {object} release normalized release (tag, name, url, ...)
 * @param {object} content { intro, sections }
 * @param {object} opts
 *   - forPosting {boolean}  role ping mention vs copy-paste text
 *   - roleName {string}     override the top "@..." role text (per channel)
 *   - roleId {string}       override the pinged role id (per channel)
 *   - headline {string}     override the bold headline (default "X is now live 🎉")
 *   - highlightsLabel {string}  the "**Release Highlights**" divider label ('' to hide)
 *   - includeInstall {boolean}  include the install/upgrade block (default true)
 */
function buildAnnouncement(release, content, opts = {}) {
  // Back-compat: a boolean 3rd arg means { forPosting }.
  if (typeof opts === 'boolean') opts = { forPosting: opts };
  const {
    forPosting = false,
    roleName,
    roleId,
    headline,
    highlightsLabel = 'Release Highlights',
    includeInstall = true,
  } = opts;

  const { intro, sections } = content;
  const parts = [];

  const title =
    headline || `**${config.productName} ${release.tag} is now live** ${config.releaseEmoji}`;
  parts.push(`${mentionLine(forPosting, roleName, roleId)} — ${title}`);

  if (intro) parts.push(intro);

  const rendered = SECTION_ORDER.map((k) => renderSection(k, sections[k])).filter(Boolean);
  if (rendered.length > 0) {
    if (highlightsLabel) parts.push(`**${highlightsLabel}**`);
    parts.push(rendered.join('\n\n'));
  }

  if (includeInstall) parts.push(installBlock(release));

  parts.push(`📝 Full release notes: ${release.url}`);

  return parts.join('\n\n');
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

module.exports = { buildAnnouncement, chunkForDiscord, installBlock, SECTION_META };
