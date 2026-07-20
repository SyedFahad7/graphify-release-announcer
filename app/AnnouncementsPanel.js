'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

const DISMISS_KEY = 'graphify-announce-dismissed';

function loadDismissed() {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function saveDismissed(set) {
  try {
    localStorage.setItem(DISMISS_KEY, JSON.stringify([...set]));
  } catch {
    /* ignore */
  }
}

const TYPE_LABEL = {
  milestone: 'Star milestone',
  tweet: 'X / Twitter',
  release: 'Release teaser',
  manual: 'Manual',
};

/** Vercel sometimes returns plain text ("A server error…") instead of JSON. */
async function readApiJson(res) {
  const raw = await res.text();
  let json;
  try {
    json = raw ? JSON.parse(raw) : {};
  } catch {
    const snippet = raw.replace(/\s+/g, ' ').trim().slice(0, 180);
    throw new Error(
      snippet
        ? `Server returned non-JSON (${res.status}): ${snippet}`
        : `Server returned empty non-JSON response (${res.status})`
    );
  }
  if (!res.ok && json.error) throw new Error(json.error);
  if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
  if (json.error) throw new Error(json.error);
  return json;
}

export default function AnnouncementsPanel() {
  const [loading, setLoading] = useState(false);
  const [draftingId, setDraftingId] = useState('');
  const [error, setError] = useState('');
  const [check, setCheck] = useState(null);
  const [dismissed, setDismissed] = useState(() => new Set());
  const [drafts, setDrafts] = useState({}); // id -> draft payload
  const [activeId, setActiveId] = useState(null);
  const [noLlm, setNoLlm] = useState(false);
  const [skipTwitter, setSkipTwitter] = useState(false);
  const [composeUrl, setComposeUrl] = useState('');
  const [composeNote, setComposeNote] = useState('');
  const [copied, setCopied] = useState('');
  const [createImage, setCreateImage] = useState(false);
  const [imagingId, setImagingId] = useState('');

  useEffect(() => {
    setDismissed(loadDismissed());
  }, []);

  const signals = useMemo(() => {
    const list = check?.signals || [];
    return list.filter((s) => !dismissed.has(s.id));
  }, [check, dismissed]);

  const activeDraft = activeId ? drafts[activeId] : null;
  const activeSignal = signals.find((s) => s.id === activeId) || activeDraft?.signal;

  const copy = async (key, text) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(''), 1800);
    } catch {
      /* ignore */
    }
  };

  const runCheck = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ mode: 'check' });
      if (skipTwitter) params.set('notwitter', '1');
      const res = await fetch(`/api/announcements?${params}`);
      const json = await readApiJson(res);
      setCheck(json);
      const visible = (json.signals || []).filter((s) => !loadDismissed().has(s.id));
      if (visible[0]) setActiveId(visible[0].id);
    } catch (e) {
      setError(e.message || 'Check failed');
    } finally {
      setLoading(false);
    }
  }, [skipTwitter]);

  const attachImage = useCallback(async (signal, draftText) => {
    setImagingId(signal.id);
    try {
      const res = await fetch('/api/announcements?mode=image', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ signal, draftText: draftText || '' }),
      });
      const json = await readApiJson(res);
      setDrafts((prev) => ({
        ...prev,
        [signal.id]: {
          ...(prev[signal.id] || { text: draftText || '', source: 'template', length: 0 }),
          signal,
          brief: json.brief,
          image: json.image,
          svg: json.svg,
          engine: json.engine,
          warning: json.warning,
          imageError: undefined,
        },
      }));
    } catch (e) {
      setDrafts((prev) => ({
        ...prev,
        [signal.id]: {
          ...(prev[signal.id] || { text: draftText || '', source: 'template', length: 0 }),
          signal,
          imageError: e.message || 'Image failed',
        },
      }));
      setError(e.message || 'Image failed');
    } finally {
      setImagingId('');
    }
  }, []);

  const draftOne = useCallback(
    async (signal) => {
      setDraftingId(signal.id);
      setError('');
      try {
        // Draft text alone first — combined draft+image often times out on Vercel
        // as plain "A server error…" (non-JSON). Image is a second request.
        const res = await fetch(`/api/announcements?mode=draft&nollm=${noLlm ? '1' : '0'}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ signal, createImage: false }),
        });
        const json = await readApiJson(res);
        setDrafts((prev) => ({ ...prev, [signal.id]: json }));
        setActiveId(signal.id);
        if (createImage && !noLlm) {
          setDraftingId('');
          await attachImage(signal, json.text);
        }
      } catch (e) {
        setError(e.message || 'Draft failed');
      } finally {
        setDraftingId('');
      }
    },
    [noLlm, createImage, attachImage]
  );

  const compose = useCallback(async () => {
    if (!composeUrl.trim() && !composeNote.trim()) {
      setError('Paste a tweet/release URL or a short note.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/announcements?mode=compose&nollm=${noLlm ? '1' : '0'}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          url: composeUrl.trim(),
          note: composeNote.trim(),
          createImage: false,
        }),
      });
      const json = await readApiJson(res);
      setDrafts((prev) => ({ ...prev, [json.signal.id]: json }));
      setActiveId(json.signal.id);
      setCheck((prev) => {
        const signals = prev?.signals ? [...prev.signals] : [];
        if (!signals.some((s) => s.id === json.signal.id)) {
          signals.unshift(json.signal);
        }
        return {
          ...(prev || { checkedAt: new Date().toISOString(), errors: [], canon: prev?.canon }),
          signals,
          canon: prev?.canon || json.canon,
        };
      });
      if (createImage && !noLlm) {
        setLoading(false);
        await attachImage(json.signal, json.text);
      }
    } catch (e) {
      setError(e.message || 'Compose failed');
    } finally {
      setLoading(false);
    }
  }, [composeUrl, composeNote, noLlm, createImage, attachImage]);

  const regenerateImage = useCallback(
    async (signal) => {
      const existing = drafts[signal.id];
      setError('');
      await attachImage(signal, existing?.text || '');
    },
    [drafts, attachImage]
  );

  const downloadDataUrl = (filename, dataUrl) => {
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = filename;
    a.click();
  };

  const downloadImage = async (draft, signal) => {
    if (!draft?.image?.base64) return;
    const mime = draft.image.mime || 'image/png';
    const dataUrl = `data:${mime};base64,${draft.image.base64}`;
    const base = `graphify-${(signal?.type || 'announce')}-${Date.now()}`;

    if (mime.includes('svg')) {
      try {
        const png = await svgToPngDataUrl(dataUrl);
        if (png) {
          downloadDataUrl(`${base}.png`, png);
          return;
        }
      } catch {
        /* fall through to SVG */
      }
      downloadDataUrl(`${base}.svg`, dataUrl);
      return;
    }
    downloadDataUrl(`${base}.png`, dataUrl);
  };

  const svgToPngDataUrl = (svgDataUrl) =>
    new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || 1024;
        canvas.height = img.naturalHeight || 1024;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#f8f7f0';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = () => reject(new Error('SVG rasterize failed'));
      img.src = svgDataUrl;
    });

  const dismiss = (id) => {
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(id);
      saveDismissed(next);
      return next;
    });
    if (activeId === id) setActiveId(null);
  };

  return (
    <div>
      <p className="studio-lead">
        Check Safi’s X, @graphify, star milestones, and the latest release. Claude drafts a Coolify /
        Cursor-style post for <strong>#announcements</strong>. Nothing is posted; you copy and paste.
      </p>

      {(check?.canon || activeDraft?.canon) && (
        <div className="canon-hint">
          Grounded on <code>brand/canon</code>
          {' · '}
          first public {(check?.canon || activeDraft?.canon).firstPublicAt}
          {' · '}
          {(check?.canon || activeDraft?.canon).projectAgeLabel}
          {' · '}
          edit facts/lessons in the repo, then redeploy
        </div>
      )}

      <div className="controls">
        <button className="btn primary" onClick={runCheck} disabled={loading}>
          {loading ? 'Checking…' : '↻ Check for news'}
        </button>
        <label className="toggle">
          <input type="checkbox" checked={noLlm} onChange={(e) => setNoLlm(e.target.checked)} />
          Skip AI (templates only)
        </label>
        <label className="toggle">
          <input
            type="checkbox"
            checked={skipTwitter}
            onChange={(e) => setSkipTwitter(e.target.checked)}
          />
          Skip Twitter
        </label>
        <label className="toggle" title="Claude brainstorms Graphify-branded art, then SVG (optional OpenAI PNG)">
          <input
            type="checkbox"
            checked={createImage}
            onChange={(e) => setCreateImage(e.target.checked)}
            disabled={noLlm}
          />
          Create image too
        </label>
      </div>

      <div className="compose-box card">
        <h3 className="compose-title">Compose from link</h3>
        <div className="compose-row">
          <input
            className="input grow"
            placeholder="https://x.com/.../status/... or GitHub release URL"
            value={composeUrl}
            onChange={(e) => setComposeUrl(e.target.value)}
          />
          <button className="btn" onClick={compose} disabled={loading}>
            Draft
          </button>
        </div>
        <textarea
          className="compose-note"
          placeholder="Optional note / extra context for Claude"
          value={composeNote}
          onChange={(e) => setComposeNote(e.target.value)}
          rows={2}
        />
      </div>

      {error && <div className="error">⚠️ {error}</div>}

      {check?.stars && (
        <div className="stars-bar">
          Live stars: <strong>{check.stars.count.toLocaleString()}</strong>
          {' · '}
          <a href={check.stars.url} target="_blank" rel="noreferrer">
            {check.stars.fullName}
          </a>
        </div>
      )}

      {check?.errors?.length > 0 && (
        <div className="na-note" style={{ marginBottom: 16 }}>
          Some sources failed: {check.errors.join(' · ')}
        </div>
      )}

      <div className="layout">
        <aside className="side">
          <h3>Signal queue</h3>
          {!check && !loading && <div className="side-hint">Hit Check for news to fill the queue.</div>}
          {loading && !check && (
            <div className="status">
              <span className="spinner" /> Scanning…
            </div>
          )}
          {signals.length === 0 && check && (
            <div className="side-hint">No new signals (or all dismissed). Try Compose from link.</div>
          )}
          {signals.map((s) => (
            <button
              key={s.id}
              className={`rel ${s.id === activeId ? 'active' : ''}`}
              onClick={() => setActiveId(s.id)}
            >
              <div className="tag">{TYPE_LABEL[s.type] || s.type}</div>
              <div className="meta">{s.title}</div>
            </button>
          ))}
        </aside>

        <main className="main">
          {!activeSignal && (
            <div className="status">Pick a signal, or compose from a URL.</div>
          )}

          {activeSignal && (
            <>
              <div className="card">
                <div className="relhead">
                  <span className="v" style={{ fontSize: 18 }}>
                    {activeSignal.title}
                  </span>
                  <span className="pill pre">{TYPE_LABEL[activeSignal.type] || activeSignal.type}</span>
                </div>
                <p className="signal-summary">{activeSignal.summary}</p>
                {activeSignal.url && (
                  <a href={activeSignal.url} target="_blank" rel="noreferrer">
                    Open source ↗
                  </a>
                )}
                <div className="chunk-actions" style={{ marginTop: 12 }}>
                  <button
                    className="btn primary"
                    onClick={() => draftOne(activeSignal)}
                    disabled={Boolean(draftingId) || Boolean(imagingId)}
                  >
                    {draftingId === activeSignal.id
                      ? createImage
                        ? 'Drafting + designing…'
                        : 'Drafting…'
                      : drafts[activeSignal.id]
                        ? '↻ Re-draft'
                        : '✦ Draft announcement'}
                  </button>
                  {drafts[activeSignal.id] && (
                    <button
                      className="btn"
                      onClick={() => regenerateImage(activeSignal)}
                      disabled={Boolean(imagingId) || noLlm}
                    >
                      {imagingId === activeSignal.id ? 'Imaging…' : '🖼 Image only'}
                    </button>
                  )}
                  <button className="btn" onClick={() => dismiss(activeSignal.id)}>
                    Dismiss
                  </button>
                </div>
                {createImage && (
                  <p className="na-note" style={{ marginTop: 10 }}>
                    Claude art-directs atmosphere + type; official logo PNGs from{' '}
                    <code>brand/logos</code> are injected (never redrawn). Download PNG for Discord.
                    Needs <code>ANTHROPIC_API_KEY</code>.
                  </p>
                )}
              </div>

              {activeDraft && (
                <div className="card post">
                  <div className="bar">
                    <span className="label">
                      Paste into <strong>#announcements</strong>
                      <span className="sub"> · {activeDraft.length} chars</span>
                    </span>
                    <button
                      className={`copy primary-copy ${copied === activeSignal.id ? 'done' : ''}`}
                      onClick={() => copy(activeSignal.id, activeDraft.text)}
                    >
                      {copied === activeSignal.id ? '✓ Copied' : '📋 Copy'}
                    </button>
                  </div>
                  <div className="source">
                    <span className="dot">●</span>{' '}
                    {activeDraft.source === 'llm'
                      ? 'Wording by Claude'
                      : 'Template draft (no AI / fallback)'}
                  </div>
                  {activeDraft.warnings?.length > 0 && (
                    <div className="na-note" style={{ marginTop: 10, marginBottom: 10 }}>
                      Canon adjusted: {activeDraft.warnings.join(' · ')}
                    </div>
                  )}
                  <pre className="msg">{activeDraft.text}</pre>
                </div>
              )}

              {activeDraft?.imageError && (
                <div className="error">Image: {activeDraft.imageError}</div>
              )}

              {activeDraft?.image?.base64 && (
                <div className="card announce-image">
                  <div className="bar">
                    <span className="label">
                      Announcement image
                      <span className="sub">
                        {' '}
                        · {activeDraft.engine || activeDraft.image.provider}
                        {activeDraft.brief?.surface ? ` · ${activeDraft.brief.surface}` : ''}
                      </span>
                    </span>
                    <button
                      className="copy"
                      onClick={() => downloadImage(activeDraft, activeSignal)}
                    >
                      Download
                    </button>
                  </div>
                  {activeDraft.warning && (
                    <div className="na-note" style={{ marginBottom: 10 }}>
                      Raster note: {activeDraft.warning}
                    </div>
                  )}
                  {activeDraft.brief?.mood && (
                    <p className="signal-summary">{activeDraft.brief.mood}</p>
                  )}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    className="announce-image-preview"
                    alt={activeDraft.brief?.headline || 'Graphify announcement'}
                    src={`data:${activeDraft.image.mime};base64,${activeDraft.image.base64}`}
                  />
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
