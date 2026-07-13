const config = require('./config');
const { chunkForDiscord } = require('./format');

const API = 'https://discord.com/api/v10';

async function sendMessage(channelId, content, { allowRolePing }) {
  const body = { content };
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

  const chunks = chunkForDiscord(text);
  for (let i = 0; i < chunks.length; i++) {
    // Only the first chunk carries the role ping.
    await sendMessage(config.channelId, chunks[i], { allowRolePing: i === 0 });
    if (i < chunks.length - 1) await new Promise((r) => setTimeout(r, 800));
  }
  return chunks.length;
}

module.exports = { postAnnouncement };
