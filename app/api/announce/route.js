export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import * as github from '../../../github';
import { buildContent } from '../../../content';
import { buildChannels } from '../../../channels';
import { buildCombinedAnnouncement, MAX_COMBINE, MIN_COMBINE } from '../../../combine';

function slim(release) {
  return {
    tag: release.tag,
    name: release.name,
    url: release.url,
    prerelease: release.prerelease,
    draft: release.draft,
    publishedAt: release.publishedAt,
    author: release.author,
    combined: Boolean(release.combined),
    tags: release.tags || null,
    spanLabel: release.spanLabel || null,
  };
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get('mode') || 'announce';
  const tag = searchParams.get('tag');
  const tagsParam = searchParams.get('tags');
  const noLlm = searchParams.get('nollm') === '1';

  try {
    // Sidebar: recent releases so you can see what's out there.
    if (mode === 'list') {
      const n = Math.min(parseInt(searchParams.get('n'), 10) || 20, 40);
      const releases = await github.listReleases(n);
      return Response.json({ releases: releases.map(slim) });
    }

    // Combine 2–4 releases into one catch-up announcement.
    if (mode === 'combine' || tagsParam) {
      const tags = (tagsParam || '')
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
      if (tags.length < MIN_COMBINE || tags.length > MAX_COMBINE) {
        return Response.json(
          { error: `Pick ${MIN_COMBINE}–${MAX_COMBINE} release tags (got ${tags.length}).` },
          { status: 400 }
        );
      }
      const result = await buildCombinedAnnouncement(tags, { noLlm });
      return Response.json({
        release: slim(result.release),
        releases: result.releases,
        source: result.source,
        posts: result.posts,
        combined: true,
      });
    }

    // Main: fetch a release and generate a post per channel.
    const release = tag
      ? await github.getReleaseByTag(tag)
      : await github.getLatestRelease();

    const { content, source } = await buildContent(release, { noLlm });
    const posts = buildChannels(release, content, { forPosting: false });

    return Response.json({ release: slim(release), source, posts, combined: false });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
