export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { checkSignals } from '../../../signals/check';
import { draftRedditPost, listAngles, listSubs } from '../../../reddit-llm';
import { buildGroundingBundle } from '../../../lib/reddit-pack';
import { canonMeta } from '../../../lib/canon';

async function gatherContext({
  includeTwitter = true,
  includeExa = true,
  includeRss = true,
} = {}) {
  const check = await checkSignals({ includeTwitter, includeExa, includeRss });
  const grounding = buildGroundingBundle(check);
  return {
    grounding,
    stars: check.stars,
    exa: check.exa,
    rss: check.rss,
    twitter: check.twitter,
    errors: check.errors || [],
    checkedAt: check.checkedAt,
    canon: canonMeta(),
    subs: listSubs(),
    angles: listAngles(),
  };
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get('mode') || 'meta';
  const noLlm = searchParams.get('nollm') === '1';
  const skipTwitter = searchParams.get('notwitter') === '1';
  const skipExa = searchParams.get('noexa') === '1';
  const skipRss = searchParams.get('norss') === '1';

  try {
    if (mode === 'meta') {
      return Response.json({
        subs: listSubs(),
        angles: listAngles(),
        canon: canonMeta(),
      });
    }

    if (mode === 'context') {
      const ctx = await gatherContext({
        includeTwitter: !skipTwitter,
        includeExa: !skipExa,
        includeRss: !skipRss,
      });
      return Response.json(ctx);
    }

    if (mode === 'draft') {
      const subreddit = searchParams.get('subreddit') || 'SideProject';
      const angle = searchParams.get('angle') || 'builder_story';
      const subtlety = searchParams.get('subtlety') || '3';
      const note = searchParams.get('note') || '';
      let grounding = null;
      if (searchParams.get('withContext') === '1') {
        const ctx = await gatherContext({
          includeTwitter: !skipTwitter,
          includeExa: !skipExa,
          includeRss: !skipRss,
        });
        grounding = ctx.grounding;
      }
      const draft = await draftRedditPost({
        subreddit,
        angle,
        subtlety,
        note,
        grounding,
        noLlm,
      });
      return Response.json({ ...draft, grounding });
    }

    return Response.json({ error: `Unknown mode: ${mode}` }, { status: 400 });
  } catch (err) {
    return Response.json({ error: err.message || 'Reddit API failed' }, { status: 500 });
  }
}

export async function POST(request) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get('mode') || 'draft';
  const noLlm = searchParams.get('nollm') === '1';

  try {
    const body = await request.json().catch(() => ({}));

    if (mode === 'context') {
      const ctx = await gatherContext({
        includeTwitter: body.includeTwitter !== false,
        includeExa: body.includeExa !== false,
        includeRss: body.includeRss !== false,
      });
      return Response.json(ctx);
    }

    if (mode === 'draft') {
      let grounding = body.grounding || null;
      if (!grounding && body.refreshContext !== false) {
        const ctx = await gatherContext({
          includeTwitter: body.includeTwitter !== false,
          includeExa: body.includeExa !== false,
          includeRss: body.includeRss !== false,
        });
        grounding = ctx.grounding;
      }

      const draft = await draftRedditPost({
        subreddit: body.subreddit || 'SideProject',
        angle: body.angle || 'builder_story',
        subtlety: body.subtlety ?? 3,
        note: body.note || '',
        grounding,
        noLlm: noLlm || body.noLlm === true,
      });

      return Response.json({
        ...draft,
        grounding,
        canon: draft.canon || canonMeta(),
      });
    }

    return Response.json({ error: 'POST expects mode=context|draft' }, { status: 400 });
  } catch (err) {
    return Response.json({ error: err.message || 'Reddit API failed' }, { status: 500 });
  }
}
