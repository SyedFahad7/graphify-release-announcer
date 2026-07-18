'use client';

import { useCallback, useEffect, useState } from 'react';

const MAX_COMBINE = 4;
const MIN_COMBINE = 2;

function fmtDate(d) {
  if (!d) return '';
  try {
    return new Date(d).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return d.slice(0, 10);
  }
}

export default function Page() {
  const [releases, setReleases] = useState([]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [tag, setTag] = useState('');
  const [activeTag, setActiveTag] = useState(null);
  const [activeTab, setActiveTab] = useState('production');
  const [noLlm, setNoLlm] = useState(false);
  const [copied, setCopied] = useState('');
  const [chunkIdx, setChunkIdx] = useState(0); // next Discord part to copy
  const [mode, setMode] = useState('single'); // 'single' | 'combine'
  const [selected, setSelected] = useState([]); // tags for combine

  const loadList = useCallback(async () => {
    try {
      const res = await fetch('/api/announce?mode=list&n=20');
      const json = await res.json();
      if (json.releases) setReleases(json.releases);
    } catch {
      /* non-fatal */
    }
  }, []);

  const generate = useCallback(
    async (which) => {
      setLoading(true);
      setError('');
      try {
        const params = new URLSearchParams();
        if (which) params.set('tag', which);
        if (noLlm) params.set('nollm', '1');
        const res = await fetch(`/api/announce?${params.toString()}`);
        const json = await res.json();
        if (json.error) throw new Error(json.error);
        setData(json);
        setActiveTag(json.release.tag);
        setChunkIdx(0);
        const firstApplicable = json.posts.find((p) => p.applicable) || json.posts[0];
        setActiveTab(firstApplicable.key);
      } catch (e) {
        setError(e.message || 'Something went wrong');
        setData(null);
      } finally {
        setLoading(false);
      }
    },
    [noLlm]
  );

  const generateCombined = useCallback(async () => {
    if (selected.length < MIN_COMBINE || selected.length > MAX_COMBINE) {
      setError(`Select ${MIN_COMBINE}–${MAX_COMBINE} releases to combine.`);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      params.set('mode', 'combine');
      params.set('tags', selected.join(','));
      if (noLlm) params.set('nollm', '1');
      const res = await fetch(`/api/announce?${params.toString()}`);
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setData(json);
      setActiveTag(json.release.tag);
      setChunkIdx(0);
      const firstApplicable = json.posts.find((p) => p.applicable) || json.posts[0];
      setActiveTab(firstApplicable.key);
    } catch (e) {
      setError(e.message || 'Something went wrong');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [selected, noLlm]);

  useEffect(() => {
    loadList();
    generate(null);
  }, [loadList, generate]);

  const copy = async (key, text) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(''), 1800);
    } catch {
      /* ignore */
    }
  };

  const toggleSelect = (t) => {
    setSelected((prev) => {
      if (prev.includes(t)) return prev.filter((x) => x !== t);
      if (prev.length >= MAX_COMBINE) return prev;
      return [...prev, t];
    });
  };

  const switchMode = (next) => {
    setMode(next);
    setError('');
    if (next === 'single') setSelected([]);
  };

  const posts = data?.posts || [];
  const active = posts.find((p) => p.key === activeTab);
  const canCombine = selected.length >= MIN_COMBINE && selected.length <= MAX_COMBINE;

  return (
    <div className="wrap">
      <div className="hero">
        <div>
          <h1>Graphify Release Announcer</h1>
          <p>
            One click turns Graphify releases into a ready-to-paste Discord
            announcement. Missed a couple? Switch to Combine and pick 2–4 tags.
            Nothing is posted; you copy and paste it yourself.
          </p>
        </div>
        <div className="repo-badge">Graphify-Labs/graphify</div>
      </div>

      <div className="mode-tabs">
        <button
          className={`mode-tab ${mode === 'single' ? 'active' : ''}`}
          onClick={() => switchMode('single')}
        >
          Single release
        </button>
        <button
          className={`mode-tab ${mode === 'combine' ? 'active' : ''}`}
          onClick={() => switchMode('combine')}
        >
          Combine 2–4
        </button>
      </div>

      <div className="controls">
        {mode === 'single' ? (
          <>
            <button className="btn primary" onClick={() => generate(null)} disabled={loading}>
              {loading ? 'Checking…' : '↻ Check latest release'}
            </button>
            <input
              className="input"
              placeholder="tag e.g. v0.9.18"
              value={tag}
              onChange={(e) => setTag(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && tag.trim() && generate(tag.trim())}
            />
            <button
              className="btn"
              onClick={() => tag.trim() && generate(tag.trim())}
              disabled={loading || !tag.trim()}
            >
              Generate
            </button>
          </>
        ) : (
          <>
            <button
              className="btn primary"
              onClick={generateCombined}
              disabled={loading || !canCombine}
            >
              {loading
                ? 'Combining…'
                : canCombine
                  ? `✦ Build combined (${selected.length})`
                  : `Select ${MIN_COMBINE}–${MAX_COMBINE} releases`}
            </button>
            {selected.length > 0 && (
              <div className="chips">
                {selected.map((t) => (
                  <button key={t} className="chip" onClick={() => toggleSelect(t)} title="Remove">
                    {t} ×
                  </button>
                ))}
                <button className="chip clear" onClick={() => setSelected([])}>
                  Clear
                </button>
              </div>
            )}
          </>
        )}
        <label className="toggle">
          <input type="checkbox" checked={noLlm} onChange={(e) => setNoLlm(e.target.checked)} />
          Skip AI (use built-in parser)
        </label>
      </div>

      <div className="layout">
        <aside className="side">
          <h3>{mode === 'combine' ? 'Select releases' : 'Recent releases'}</h3>
          {mode === 'combine' && (
            <div className="side-hint">
              Tick {MIN_COMBINE}–{MAX_COMBINE} tags you missed. Newest install target wins.
            </div>
          )}
          {releases.length === 0 && <div className="status">Loading…</div>}
          {releases.map((r) => {
            const isOn = mode === 'combine' ? selected.includes(r.tag) : r.tag === activeTag;
            const lockedOut =
              mode === 'combine' && !selected.includes(r.tag) && selected.length >= MAX_COMBINE;
            return (
              <button
                key={r.tag}
                className={`rel ${isOn ? 'active' : ''} ${lockedOut ? 'locked' : ''}`}
                onClick={() => {
                  if (mode === 'combine') toggleSelect(r.tag);
                  else generate(r.tag);
                }}
                disabled={lockedOut}
              >
                <div className="tag-row">
                  {mode === 'combine' && (
                    <span className={`check ${selected.includes(r.tag) ? 'on' : ''}`}>
                      {selected.includes(r.tag) ? '✓' : ''}
                    </span>
                  )}
                  <div className="tag">{r.tag}</div>
                </div>
                <div className="meta">
                  <span>{fmtDate(r.publishedAt)}</span>
                  {r.prerelease && <span className="pill pre">beta</span>}
                  {r.draft && <span className="pill">draft</span>}
                </div>
              </button>
            );
          })}
        </aside>

        <main className="main">
          {error && <div className="error">⚠️ {error}</div>}

          {loading && !data && (
            <div className="status">
              <span className="spinner" /> Fetching release and building your announcement…
            </div>
          )}

          {data && (
            <>
              <div className="card">
                <div className="relhead">
                  <span className="v">{data.release.name || data.release.tag}</span>
                  {data.combined && <span className="pill pre">combined</span>}
                  {data.release.prerelease && <span className="pill pre">prerelease</span>}
                  <span className="sub">{fmtDate(data.release.publishedAt)}</span>
                  <span className="sub">·</span>
                  <a href={data.release.url} target="_blank" rel="noreferrer">
                    View on GitHub ↗
                  </a>
                </div>
                {data.combined && data.release.tags && (
                  <div className="cover-tags">
                    Covers {data.release.tags.join(' · ')}
                  </div>
                )}
                <div className="source">
                  <span className="dot">●</span>{' '}
                  {data.source === 'llm'
                    ? 'Wording polished by Claude'
                    : 'Generated by the built-in parser (no AI)'}
                </div>
              </div>

              <div className="tabs">
                {posts.map((p) => (
                  <button
                    key={p.key}
                    className={`tab ${p.key === activeTab ? 'active' : ''} ${p.applicable ? '' : 'na'}`}
                    onClick={() => setActiveTab(p.key)}
                  >
                    {p.label}
                    <span className="ch">{p.channel}</span>
                  </button>
                ))}
              </div>

              {active && (
                <div className="card post">
                  {(() => {
                    const parts = active.chunks?.length > 1 ? active.chunks : null;
                    const needsSplit = Boolean(parts);
                    const safeIdx = parts ? Math.min(chunkIdx, parts.length - 1) : 0;
                    const copyDiscordPart = (i) => {
                      copy(`${active.key}-${i}`, parts[i]);
                      setChunkIdx(Math.min(i + 1, parts.length - 1));
                    };
                    return (
                      <>
                        <div className="bar">
                          <span className="label">
                            Paste into <strong>{active.channel}</strong>
                            {active.length ? (
                              <span className="sub"> · {active.length} chars</span>
                            ) : null}
                          </span>
                          {needsSplit ? (
                            <button
                              className={`copy primary-copy ${copied === `${active.key}-${safeIdx}` ? 'done' : ''}`}
                              onClick={() => copyDiscordPart(safeIdx)}
                            >
                              {copied === `${active.key}-${safeIdx}`
                                ? `✓ Part ${safeIdx + 1} copied — paste in Discord`
                                : `📋 Copy Discord part ${safeIdx + 1}/${parts.length}`}
                            </button>
                          ) : (
                            <button
                              className={`copy primary-copy ${copied === active.key ? 'done' : ''}`}
                              onClick={() => copy(active.key, active.text)}
                            >
                              {copied === active.key ? '✓ Copied' : '📋 Copy'}
                            </button>
                          )}
                        </div>

                        {!active.applicable && (
                          <div className="na-note" style={{ marginBottom: 12 }}>
                            This release doesn’t have anything for {active.channel}. Shown anyway in
                            case you want it.
                          </div>
                        )}

                        {needsSplit && (
                          <div className="discord-split">
                            <strong>Discord will turn this into a .txt file if you paste it all at once.</strong>
                            <p>
                              Free accounts: <strong>2000</strong> chars/message. Nitro: <strong>4000</strong>.
                              Server boosts do <em>not</em> raise that. This post is {active.length} chars,
                              so paste it as <strong>{parts.length} messages</strong> in order.
                            </p>
                            <div className="chunk-actions">
                              {parts.map((chunk, i) => (
                                <button
                                  key={i}
                                  className={`copy ${copied === `${active.key}-${i}` ? 'done' : ''} ${i === safeIdx ? 'next' : ''}`}
                                  onClick={() => copyDiscordPart(i)}
                                >
                                  {copied === `${active.key}-${i}`
                                    ? `✓ Part ${i + 1}`
                                    : `Part ${i + 1}/${parts.length} (${chunk.length} chars)`}
                                </button>
                              ))}
                              <button
                                className={`copy ${copied === active.key ? 'done' : ''}`}
                                onClick={() => copy(active.key, active.text)}
                              >
                                {copied === active.key ? '✓ Full copied' : 'Copy full (for editing)'}
                              </button>
                            </div>
                          </div>
                        )}

                        <pre className="msg">{active.text}</pre>
                      </>
                    );
                  })()}
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
