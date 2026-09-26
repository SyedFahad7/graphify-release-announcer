export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { chunkForDiscord } from '../../../format';
import { postAnnouncement, preparePostText } from '../../../discord';
import { buildProduction } from '../../../lib/poll-releases';
import * as queue from '../../../lib/release-queue';
import * as github from '../../../github';

function withChunks(row) {
  const text = row.paste_text || '';
  const budget = discordBudget();
  const chunks = chunkForDiscord(text, budget);
  return {
    tag: row.tag,
    name: row.name,
    url: row.url,
    published_at: row.published_at,
    source: row.source,
    paste_text: text,
    chunks: chunks.length > 1 ? chunks : null,
    length: text.length,
  };
}

function discordBudget() {
  return 1990;
}

export async function GET() {
  if (!queue.configured()) {
    return Response.json({ pending: [], configured: false });
  }
  try {
    const rows = await queue.listPending();
    return Response.json({ pending: rows.map(withChunks), configured: true });
  } catch (err) {
    return Response.json({ pending: [], configured: true, error: err.message }, { status: 200 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const tag = String(body.tag || '').trim();
    const action = body.action === 'skip' ? 'skip' : 'send';
    if (!tag) return Response.json({ error: 'Missing tag' }, { status: 400 });

    if (action === 'skip') {
      if (!queue.configured()) {
        return Response.json({ error: 'Supabase is not configured.' }, { status: 503 });
      }
      await queue.upsert({ tag, status: 'skipped' });
      return Response.json({ ok: true, status: 'skipped' });
    }

    await github.getReleaseByTag(tag);

    let postText = null;
    if (queue.configured()) {
      const row = await queue.get(tag);
      if (row?.status === 'pending' && row.post_text) postText = row.post_text;
    }
    if (!postText && typeof body.text === 'string' && body.text.trim()) {
      postText = preparePostText(body.text);
    }
    if (!postText) {
      const release = await github.getReleaseByTag(tag);
      postText = (await buildProduction(release)).postText;
    }

    const messages = await postAnnouncement(postText);

    if (queue.configured()) {
      await queue.upsert({
        tag,
        status: 'sent',
        post_text: postText,
        sent_at: new Date().toISOString(),
      });
    }

    return Response.json({ ok: true, status: 'sent', messages });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
