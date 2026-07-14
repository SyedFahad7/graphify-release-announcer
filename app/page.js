'use client';

import { useCallback, useEffect, useState } from 'react';

function fmtDate(d) {
  if (!d) return '';
  try {
    return new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
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

  const loadList = useCallback(async () => {
    try {
      const res = await fetch('/api/announce?mode=list&n=12');
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

  const posts = data?.posts || [];
  const active = posts.find((p) => p.key === activeTab);

  return (
    <div className="wrap">
      <div className="hero">
        <div>
          <h1>Graphify Release Announcer</h1>
          <p>
            One click turns the latest Graphify release into a ready-to-paste,
            Coolify-style Discord announcement — per channel. Nothing is posted;
            you copy and paste it yourself.
          </p>
        </div>
        <div className="repo-badge">Graphify-Labs/graphify</div>
      </div>

      <div className="controls">
        <button className="btn primary" onClick={() => generate(null)} disabled={loading}>
          {loading ? 'Checking…' : '↻ Check latest release'}
        </button>
        <input
          className="input"
          placeholder="tag e.g. v0.9.14"
          value={tag}
          onChange={(e) => setTag(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && tag.trim() && generate(tag.trim())}
        />
        <button className="btn" onClick={() => tag.trim() && generate(tag.trim())} disabled={loading || !tag.trim()}>
          Generate
        </button>
        <label className="toggle">
          <input type="checkbox" checked={noLlm} onChange={(e) => setNoLlm(e.target.checked)} />
          Skip AI (use built-in parser)
        </label>
      </div>

      <div className="layout">
        <aside className="side">
          <h3>Recent releases</h3>
          {releases.length === 0 && <div className="status">Loading…</div>}
          {releases.map((r) => (
            <button
              key={r.tag}
              className={`rel ${r.tag === activeTag ? 'active' : ''}`}
              onClick={() => generate(r.tag)}
            >
              <div className="tag">{r.tag}</div>
              <div className="meta">
                <span>{fmtDate(r.publishedAt)}</span>
                {r.prerelease && <span className="pill pre">beta</span>}
                {r.draft && <span className="pill">draft</span>}
              </div>
            </button>
          ))}
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
                  {data.release.prerelease && <span className="pill pre">prerelease</span>}
                  <span className="sub">{fmtDate(data.release.publishedAt)}</span>
                  <span className="sub">·</span>
                  <a href={data.release.url} target="_blank" rel="noreferrer">View on GitHub ↗</a>
                </div>
                <div className="source">
                  <span className="dot">●</span>{' '}
                  {data.source === 'llm' ? 'Wording polished by Claude' : 'Generated by the built-in parser (no AI)'}
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
                  <div className="bar">
                    <span className="label">
                      Paste into <strong>{active.channel}</strong>
                    </span>
                    <button
                      className={`copy ${copied === active.key ? 'done' : ''}`}
                      onClick={() => copy(active.key, active.text)}
                    >
                      {copied === active.key ? '✓ Copied' : '📋 Copy'}
                    </button>
                  </div>
                  {!active.applicable && (
                    <div className="na-note" style={{ marginBottom: 12 }}>
                      This release doesn’t have anything for {active.channel}. Shown anyway in case you want it.
                    </div>
                  )}
                  <pre className="msg">{active.text}</pre>
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
