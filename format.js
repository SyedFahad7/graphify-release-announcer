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
function mentionLine(forPosting) {
  if (forPosting && config.roleId) return `<@&${config.roleId}>`;
  return `@${config.roleName}`;
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

/**
 * Build the full announcement text.
 * @param {object} release normalized release (tag, name, url, ...)
 * @param {object} content { intro, sections }
 * @param {boolean} forPosting true => role ping mention; false => copy-paste text
 */
function buildAnnouncement(release, content, forPosting = false) {
  const { intro, sections } = content;
  const parts = [];

  const head = `${mentionLine(forPosting)} — **${config.productName} ${release.tag} is now live** ${config.releaseEmoji}`;
  parts.push(head);

  if (intro) parts.push(intro);

  const rendered = SECTION_ORDER.map((k) => renderSection(k, sections[k])).filter(
    Boolean
  );

  if (rendered.length > 0) {
    parts.push('**Release Highlights**');
    parts.push(rendered.join('\n\n'));
  }

  parts.push(
    `**⬆️ Install / Upgrade**\n\`\`\`\npip install --upgrade ${config.pypiPackage}\n# or\nuv tool install ${config.pypiPackage}@${release.tag.replace(/^v/, '')}\n\`\`\``
  );

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

module.exports = { buildAnnouncement, chunkForDiscord, SECTION_META };
