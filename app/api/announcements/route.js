export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Claude brief + SVG (and optional OpenAI) can exceed default serverless limits.
export const maxDuration = 120;

import { checkSignals, manualSignal } from '../../../signals/check';
import { draftAnnouncement } from '../../../announce-llm';
import { generateAnnouncementImage } from '../../../announce-image';

async function withOptionalImage(signal, draft, { createImage, noLlm }) {
  if (!createImage) return { signal, ...draft, channel: '#announcements' };
  if (noLlm) {
    return {
      signal,
      ...draft,
      channel: '#announcements',
      imageError: 'Create image needs Claude (uncheck Skip AI).',
    };
  }
  try {
    const img = await generateAnnouncementImage(signal, { draftText: draft.text });
    return { signal, ...draft, channel: '#announcements', ...img };
  } catch (err) {
    return {
      signal,
      ...draft,
      channel: '#announcements',
      imageError: err.message || 'Image generation failed',
    };
  }
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get('mode') || 'check';
  const noLlm = searchParams.get('nollm') === '1';
  const skipTwitter = searchParams.get('notwitter') === '1';

  try {
    if (mode === 'check') {
      const result = await checkSignals({ includeTwitter: !skipTwitter });
      return Response.json(result);
    }

    if (mode === 'draft') {
      // Rebuild signal from query params (stateless serverless).
      const type = searchParams.get('type');
      const id = searchParams.get('id');
      const title = searchParams.get('title') || '';
      const summary = searchParams.get('summary') || '';
      const url = searchParams.get('url') || '';
      const metaRaw = searchParams.get('meta');
      let meta = {};
      if (metaRaw) {
        try {
          meta = JSON.parse(metaRaw);
        } catch {
          meta = {};
        }
      }

      if (!type || !id) {
        return Response.json({ error: 'draft requires type and id' }, { status: 400 });
      }

      const signal = {
        id,
        type,
        title: title || id,
        summary: summary || title || id,
        url: url || null,
        score: 50,
        meta,
      };

      const createImage = searchParams.get('image') === '1';
      const draft = await draftAnnouncement(signal, { noLlm });
      return Response.json(await withOptionalImage(signal, draft, { createImage, noLlm }));
    }

    if (mode === 'compose') {
      const url = searchParams.get('url') || '';
      const note = searchParams.get('note') || '';
      const title = searchParams.get('title') || '';
      if (!url && !note) {
        return Response.json({ error: 'compose needs url or note' }, { status: 400 });
      }
      const createImage = searchParams.get('image') === '1';
      const signal = manualSignal({ url, note, title });
      const draft = await draftAnnouncement(signal, { noLlm });
      return Response.json(await withOptionalImage(signal, draft, { createImage, noLlm }));
    }

    if (mode === 'image') {
      const type = searchParams.get('type');
      const id = searchParams.get('id');
      if (!type || !id) {
        return Response.json({ error: 'image requires type and id (or POST body)' }, { status: 400 });
      }
      return Response.json({ error: 'Use POST mode=image with signal + draftText' }, { status: 400 });
    }

    return Response.json({ error: `Unknown mode: ${mode}` }, { status: 400 });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get('mode') || 'draft';
  const noLlm = searchParams.get('nollm') === '1';

  try {
    const body = await request.json().catch(() => ({}));
    const createImage = body.createImage === true || searchParams.get('image') === '1';

    if (mode === 'draft' && body.signal) {
      const draft = await draftAnnouncement(body.signal, { noLlm });
      return Response.json(await withOptionalImage(body.signal, draft, { createImage, noLlm }));
    }

    if (mode === 'compose') {
      const signal = manualSignal({
        url: body.url,
        note: body.note,
        title: body.title,
      });
      const draft = await draftAnnouncement(signal, { noLlm });
      return Response.json(await withOptionalImage(signal, draft, { createImage, noLlm }));
    }

    if (mode === 'image' && body.signal) {
      if (noLlm) {
        return Response.json({ error: 'Create image needs Claude (uncheck Skip AI).' }, { status: 400 });
      }
      const img = await generateAnnouncementImage(body.signal, {
        draftText: body.draftText || '',
      });
      return Response.json({ signal: body.signal, ...img });
    }

    return Response.json(
      { error: 'POST expects mode=draft|compose|image with the right body' },
      { status: 400 }
    );
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
