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
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setCheck(json);
      const visible = (json.signals || []).filter((s) => !loadDismissed().has(s.id));
      if (visible[0]) setActiveId(visible[0].id);
    } catch (e) {
      setError(e.message || 'Check failed');
    } finally {
      setLoading(false);
    }
  }, [skipTwitter]);

  const draftOne = useCallback(
    async (signal) => {
      setDraftingId(signal.id);
      setError('');
      try {
        const res = await fetch(`/api/announcements?mode=draft&nollm=${noLlm ? '1' : '0'}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ signal }),
        });
        const json = await res.json();
        if (json.error) throw new Error(json.error);
        setDrafts((prev) => ({ ...prev, [signal.id]: json }));
        setActiveId(signal.id);
      } catch (e) {
        setError(e.message || 'Draft failed');
      } finally {
        setDraftingId('');
      }
    },
    [noLlm]
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
        }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setDrafts((prev) => ({ ...prev, [json.signal.id]: json }));
      setActiveId(json.signal.id);
      setCheck((prev) => {
        const signals = prev?.signals ? [...prev.signals] : [];
        if (!signals.some((s) => s.id === json.signal.id)) {
          signals.unshift(json.signal);
        }
        return {
          ...(prev || { checkedAt: new Date().toISOString(), errors: [] }),
          signals,
        };
      });
    } catch (e) {
      setError(e.message || 'Compose failed');
    } finally {
      setLoading(false);
    }
  }, [composeUrl, composeNote, noLlm]);

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
                    disabled={Boolean(draftingId)}
                  >
                    {draftingId === activeSignal.id
                      ? 'Drafting…'
                      : drafts[activeSignal.id]
                        ? '↻ Re-draft'
                        : '✦ Draft announcement'}
                  </button>
                  <button className="btn" onClick={() => dismiss(activeSignal.id)}>
                    Dismiss
                  </button>
                </div>
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
                  <pre className="msg">{activeDraft.text}</pre>
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
