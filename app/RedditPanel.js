'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

const ANGLE_LABELS = {
  builder_story: 'Builder story',
  milestone: 'Milestone',
  honest_review_seed: 'Honest review seed',
  discussion: 'Discussion',
  megathread_comment: 'Megathread comment',
};

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

function formatPublished(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return null;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function RedditPanel() {
  const [subs, setSubs] = useState([]);
  const [angles, setAngles] = useState(Object.keys(ANGLE_LABELS));
  const [subreddit, setSubreddit] = useState('SideProject');
  const [angle, setAngle] = useState('builder_story');
  const [subtlety, setSubtlety] = useState(3);
  const [note, setNote] = useState('');
  const [noLlm, setNoLlm] = useState(false);
  const [skipTwitter, setSkipTwitter] = useState(false);
  const [skipExa, setSkipExa] = useState(false);
  const [skipRss, setSkipRss] = useState(false);

  const [loadingCtx, setLoadingCtx] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [error, setError] = useState('');
  const [context, setContext] = useState(null);
  const [draft, setDraft] = useState(null);
  const [copied, setCopied] = useState('');

  const activeSub = useMemo(
    () => subs.find((s) => s.id === subreddit) || null,
    [subs, subreddit]
  );

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/reddit?mode=meta');
        const json = await readApiJson(res);
        if (json.subs?.length) {
          setSubs(json.subs);
          setSubreddit((prev) =>
            json.subs.some((s) => s.id === prev) ? prev : json.subs[0].id
          );
        }
        if (json.angles?.length) setAngles(json.angles);
      } catch {
        /* non-fatal — pack may load on draft */
      }
    })();
  }, []);

  useEffect(() => {
    if (activeSub?.defaultAngle && angles.includes(activeSub.defaultAngle)) {
      setAngle(activeSub.defaultAngle);
    }
  }, [activeSub?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const copy = async (key, text) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(''), 1800);
    } catch {
      /* ignore */
    }
  };

  const gatherContext = useCallback(async () => {
    setLoadingCtx(true);
    setError('');
    try {
      const params = new URLSearchParams({ mode: 'context' });
      if (skipTwitter) params.set('notwitter', '1');
      if (skipExa) params.set('noexa', '1');
      if (skipRss) params.set('norss', '1');
      const res = await fetch(`/api/reddit?${params}`);
      const json = await readApiJson(res);
      setContext(json);
      if (json.subs?.length) setSubs(json.subs);
      if (json.angles?.length) setAngles(json.angles);
    } catch (e) {
      setError(e.message || 'Context gather failed');
    } finally {
      setLoadingCtx(false);
    }
  }, [skipTwitter, skipExa, skipRss]);

  const runDraft = useCallback(async () => {
    setDrafting(true);
    setError('');
    try {
      const params = new URLSearchParams({ mode: 'draft' });
      if (noLlm) params.set('nollm', '1');
      const res = await fetch(`/api/reddit?${params}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          subreddit,
          angle,
          subtlety,
          note,
          grounding: context?.grounding || null,
          refreshContext: !context?.grounding,
          includeTwitter: !skipTwitter,
          includeExa: !skipExa,
          includeRss: !skipRss,
          noLlm,
        }),
      });
      const json = await readApiJson(res);
      setDraft(json);
      if (json.grounding && !context?.grounding) {
        setContext((prev) => ({
          ...(prev || {}),
          grounding: json.grounding,
          stars: json.grounding.stars,
        }));
      }
    } catch (e) {
      setError(e.message || 'Draft failed');
    } finally {
      setDrafting(false);
    }
  }, [
    subreddit,
    angle,
    subtlety,
    note,
    context,
    noLlm,
    skipTwitter,
    skipExa,
    skipRss,
  ]);

  const combined = draft
    ? `Title: ${draft.title}\n\n${draft.body}`
    : '';

  const g = context?.grounding || draft?.grounding;

  return (
    <div>
      <p className="studio-lead">
        Draft ready-to-paste Reddit posts grounded on live GitHub stars, Safi’s X, third-party
        coverage (Exa / RSS), and brand canon. Human voice, low promo. Nothing is posted; you
        copy and paste.
      </p>

      {(context?.canon || draft?.canon) && (
        <div className="canon-hint">
          Grounded on <code>brand/canon</code> + <code>brand/reddit</code>
          {' · '}
          first public {(context?.canon || draft?.canon).firstPublicAt}
          {' · '}
          {(context?.canon || draft?.canon).projectAgeLabel}
        </div>
      )}

      <div className="controls">
        <button className="btn primary" onClick={gatherContext} disabled={loadingCtx || drafting}>
          {loadingCtx ? 'Gathering…' : '↻ Gather context'}
        </button>
        <button className="btn primary" onClick={runDraft} disabled={drafting || loadingCtx}>
          {drafting ? 'Drafting…' : '✦ Draft Reddit post'}
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
        <label className="toggle">
          <input
            type="checkbox"
            checked={skipExa}
            onChange={(e) => setSkipExa(e.target.checked)}
          />
          Skip Exa
        </label>
        <label className="toggle">
          <input
            type="checkbox"
            checked={skipRss}
            onChange={(e) => setSkipRss(e.target.checked)}
          />
          Skip RSS
        </label>
      </div>

      <div className="compose-box card">
        <h3 className="compose-title">Post setup</h3>
        <div className="reddit-setup-grid">
          <label className="reddit-field">
            <span>Subreddit</span>
            <select
              className="input"
              value={subreddit}
              onChange={(e) => setSubreddit(e.target.value)}
            >
              {(subs.length
                ? subs
                : [{ id: 'SideProject', label: 'r/SideProject' }]
              ).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label || `r/${s.id}`}
                  {s.promoPolicy ? ` · ${s.promoPolicy}` : ''}
                </option>
              ))}
            </select>
          </label>
          <label className="reddit-field">
            <span>Angle</span>
            <select className="input" value={angle} onChange={(e) => setAngle(e.target.value)}>
              {angles.map((a) => (
                <option key={a} value={a}>
                  {ANGLE_LABELS[a] || a}
                </option>
              ))}
            </select>
          </label>
          <label className="reddit-field">
            <span>Subtlety {subtlety}/10</span>
            <input
              type="range"
              min={1}
              max={10}
              value={subtlety}
              onChange={(e) => setSubtlety(Number(e.target.value))}
            />
          </label>
        </div>
        {activeSub?.rulesNote && (
          <p className="na-note" style={{ marginTop: 10 }}>
            {activeSub.rulesNote}
          </p>
        )}
        <textarea
          className="compose-note"
          placeholder="Optional personal note / anecdote for Claude (e.g. tried it on my FastAPI service…)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
        />
      </div>

      {error && <div className="error">⚠️ {error}</div>}

      {g?.stars && (
        <div className="stars-bar">
          Live stars: <strong>{Number(g.stars.count).toLocaleString()}</strong>
          {g.release ? ` · ${g.release.tag}` : ''}
          {g.news?.length != null ? ` · ${g.news.length} press hits in bundle` : ''}
          {g.tweets?.length != null ? ` · ${g.tweets.length} X posts` : ''}
        </div>
      )}

      <div className="layout">
        <aside className="side">
          <h3>Grounding</h3>
          {!g && !loadingCtx && (
            <div className="side-hint">Hit Gather context (or Draft will refresh it).</div>
          )}
          {loadingCtx && (
            <div className="status">
              <span className="spinner" /> Pulling GitHub / X / Exa / RSS…
            </div>
          )}
          {g?.milestones?.map((m) => (
            <div key={m.id} className="rel" style={{ cursor: 'default' }}>
              <div className="tag">Milestone</div>
              <div className="meta">{m.title}</div>
            </div>
          ))}
          {g?.tweets?.map((t) => (
            <a
              key={t.id}
              className="rel"
              href={t.url || '#'}
              target="_blank"
              rel="noreferrer"
              style={{ textDecoration: 'none' }}
            >
              <div className="tag">X / Twitter</div>
              <div className="meta">{t.title}</div>
            </a>
          ))}
          {g?.news?.map((n) => (
            <a
              key={n.id}
              className="rel"
              href={n.url || '#'}
              target="_blank"
              rel="noreferrer"
              style={{ textDecoration: 'none' }}
            >
              <div className="tag">Web / press</div>
              <div className="meta">{n.title}</div>
              <div className="meta signal-when">
                {formatPublished(n.publishedAt) || 'date unknown'}
              </div>
            </a>
          ))}
        </aside>

        <main className="main">
          {!draft && (
            <div className="status">
              Pick a sub + angle, gather context, then draft. Copy title and body into Reddit
              yourself.
            </div>
          )}

          {draft && (
            <div className="card">
              <div className="relhead">
                <span className="v" style={{ fontSize: 18 }}>
                  r/{draft.subreddit}
                </span>
                <span className="pill pre">{ANGLE_LABELS[draft.angle] || draft.angle}</span>
                <span className="pill pre">
                  {draft.source === 'llm' ? 'Claude' : 'Template'} · {draft.wordCount} words
                </span>
              </div>

              <div className="reddit-title-block">
                <div className="reddit-label">Title</div>
                <div className="reddit-title">{draft.title}</div>
              </div>

              <div className="reddit-body-block">
                <div className="reddit-label">Body</div>
                <pre className="reddit-body">{draft.body}</pre>
              </div>

              {draft.altTitles?.length > 0 && (
                <div className="na-note" style={{ marginTop: 12 }}>
                  Alt titles:{' '}
                  {draft.altTitles.map((t, i) => (
                    <button
                      key={i}
                      className="btn"
                      style={{ marginRight: 6, marginTop: 4 }}
                      onClick={() => copy(`alt-${i}`, t)}
                    >
                      {copied === `alt-${i}` ? 'Copied' : t}
                    </button>
                  ))}
                </div>
              )}

              <div className="chunk-actions" style={{ marginTop: 14 }}>
                <button className="btn primary" onClick={() => copy('title', draft.title)}>
                  {copied === 'title' ? 'Copied title' : '📋 Copy title'}
                </button>
                <button className="btn primary" onClick={() => copy('body', draft.body)}>
                  {copied === 'body' ? 'Copied body' : '📋 Copy body'}
                </button>
                <button className="btn" onClick={() => copy('both', combined)}>
                  {copied === 'both' ? 'Copied both' : 'Copy title + body'}
                </button>
                <button className="btn" onClick={runDraft} disabled={drafting}>
                  ↻ Re-draft
                </button>
              </div>

              {(draft.flairHint || draft.postingTip || draft.riskNotes?.length > 0) && (
                <div className="reddit-tips">
                  {draft.flairHint && (
                    <p>
                      <strong>Flair hint:</strong> {draft.flairHint}
                    </p>
                  )}
                  {draft.postingTip && (
                    <p>
                      <strong>Tip:</strong> {draft.postingTip}
                    </p>
                  )}
                  {draft.riskNotes?.length > 0 && (
                    <ul>
                      {draft.riskNotes.map((r, i) => (
                        <li key={i}>{r}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
