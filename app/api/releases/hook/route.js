export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { after } from 'next/server';
import { autoPublish, verifyGithubSignature } from '../../../../lib/auto-publish';

export async function POST(request) {
  const raw = Buffer.from(await request.arrayBuffer());
  const signature = request.headers.get('x-hub-signature-256');
  if (!verifyGithubSignature(raw, signature)) {
    return Response.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let payload;
  try {
    payload = JSON.parse(raw.toString('utf8'));
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const event = request.headers.get('x-github-event');
  if (event === 'ping') return Response.json({ ok: true, action: 'pong' });
  if (event !== 'release' || payload.action !== 'published') {
    return Response.json({ ok: true, action: 'ignored' });
  }
  if (payload.release?.draft || payload.release?.prerelease) {
    return Response.json({ ok: true, action: 'ignored', reason: 'not a stable release' });
  }

  // GitHub gives the hook about 10 seconds. Drafting with Claude takes longer,
  // so the post continues after this response. The lock stops a retry from double-posting.
  after(async () => {
    try {
      const result = await autoPublish();
      console.log('release hook', result.action, result.tags || result.tag || '');
    } catch (err) {
      console.error('release hook failed:', err.message);
    }
  });

  return Response.json({ ok: true, action: 'accepted', tag: payload.release?.tag_name || null });
}
