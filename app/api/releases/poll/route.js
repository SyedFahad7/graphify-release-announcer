export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { pollNewReleases } from '../../../../lib/poll-releases';

function authorized(request) {
  const secret = process.env.CRON_SECRET || '';
  if (!secret) return false;
  return request.headers.get('authorization') === `Bearer ${secret}`;
}

export async function GET(request) {
  if (!authorized(request)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const result = await pollNewReleases();
    return Response.json(result, { status: result.ok ? 200 : 503 });
  } catch (err) {
    return Response.json({ ok: false, error: err.message }, { status: 500 });
  }
}
