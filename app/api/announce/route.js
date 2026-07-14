export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import * as github from '../../../github';
import { buildContent } from '../../../content';
import { buildChannels } from '../../../channels';

function slim(release) {
  return {
    tag: release.tag,
    name: release.name,
    url: release.url,
    prerelease: release.prerelease,
    draft: release.draft,
    publishedAt: release.publishedAt,
    author: release.author,
  };
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get('mode') || 'announce';
  const tag = searchParams.get('tag');
  const noLlm = searchParams.get('nollm') === '1';

  try {
    // Sidebar: recent releases so you can see what's out there.
    if (mode === 'list') {
      const n = Math.min(parseInt(searchParams.get('n'), 10) || 12, 30);
      const releases = await github.listReleases(n);
      return Response.json({ releases: releases.map(slim) });
    }

    // Main: fetch a release and generate a post per channel.
    const release = tag
      ? await github.getReleaseByTag(tag)
      : await github.getLatestRelease();

    const { content, source } = await buildContent(release, { noLlm });
    const posts = buildChannels(release, content, { forPosting: false });

    return Response.json({ release: slim(release), source, posts });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
