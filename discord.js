const config = require('./config');
const { fitOneDiscordMessage, BOT_MESSAGE_LIMIT } = require('./format');

const API = 'https://discord.com/api/v10';

// Discord message flag: do not unfurl link previews (the GitHub release card).
const SUPPRESS_EMBEDS = 1 << 2;

async function sendMessage(channelId, content, { allowRolePing }) {
  const body = { content, flags: SUPPRESS_EMBEDS };
  // Only allow the configured role to actually ping; suppress @everyone/user pings.
  body.allowed_mentions = allowRolePing && config.roleId
    ? { parse: [], roles: [config.roleId] }
    : { parse: [] };

  const res = await fetch(`${API}/channels/${channelId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bot ${config.discordToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (res.status === 429) {
    const data = await res.json().catch(() => ({}));
    const wait = Math.ceil((data.retry_after || 1) * 1000) + 250;
    await new Promise((r) => setTimeout(r, wait));
    return sendMessage(channelId, content, { allowRolePing });
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Discord ${res.status}: ${text.slice(0, 300)}`);
  }
  return res.json();
}

/** Post an announcement to the #production-releases channel, chunked if needed. */
async function postAnnouncement(text) {
  if (!config.discordToken) throw new Error('DISCORD_TOKEN not set');
  if (!config.channelId) throw new Error('PRODUCTION_RELEASES_CHANNEL_ID not set');

  const one = fitOneDiscordMessage(text, BOT_MESSAGE_LIMIT);
  await sendMessage(config.channelId, one, { allowRolePing: true });
  return 1;
}

/** Turn the copy-paste mention into a real role ping when a role id is set. */
function preparePostText(text) {
  if (!text) return text;
  if (text.includes('<@&')) return text;
  if (!config.roleId) return text;
  return text.replace(`@${config.roleName}`, `<@&${config.roleId}>`);
}

module.exports = { postAnnouncement, preparePostText };
