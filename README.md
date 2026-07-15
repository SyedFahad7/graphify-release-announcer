# graphify-release-announcer

Your **personal release tracker + Discord message generator** for Graphify. Two ways to use it:

- **Web app** (one click) — open the site, hit **Check latest release**, get a ready-to-paste
  announcement for each channel (Production / Feature / Security / Beta), copy, done. Deploy free on Vercel.
- **CLI** — the same thing in your terminal (`generate`, `list`, `track`, `--copy`).

Whenever a release drops it hands you a **ready-to-paste, Coolify-style announcement** — a role ping,
a one-line summary, then clean grouped highlights and a link to the full notes. You review and paste.

**It does not post anything on its own.** It's a tool you run for yourself, not a bot.

> Modeled on how teams like Coolify announce releases: `@Production Releases – vX.Y.Z is now live`,
> grouped highlights (✨ New Features · 🐛 Notable Bug Fixes · 🔒 Security · ⚠️ Breaking · 🛠️ Integrations),
> and a link to the full changelog.

---

## Why

You're not tracking the repo full-time, and raw GitHub release notes are dense/technical. This turns
whatever just shipped into a clean, human-friendly announcement you can drop into Discord in seconds —
without reading the whole changelog or knowing the internals.

## How it works

1. **Fetch** the release from GitHub (latest, or a tag you pick).
2. **Rewrite** the notes into grouped highlights:
   - **With `ANTHROPIC_API_KEY`** → Claude rewrites them into tight, friendly bullets.
   - **Without a key** → a built-in parser groups them (works offline, no cost, still good).
3. **Hand it to you** — printed, saved to `output/<tag>.md`, and (with `--copy`) on your clipboard.

---

## Web app

```bash
npm install
npm run dev            # http://localhost:3000
```

Open it and click **Check latest release**. You get a card per channel with a **Copy** button:

- **#production-releases** — the full post.
- **#feature-releases** — just the new features + integrations (lighter).
- **#security** — only shown/filled when the release has security fixes.
- **#beta** — for prereleases.

Toggle **Skip AI** to use the built-in parser instead of Claude (free, no key). The recent-releases
sidebar lets you generate a post for any older version too.

### Deploy to Vercel (one-click site)

1. Push this repo to GitHub (already done: `SyedFahad7/graphify-release-announcer`).
2. On [vercel.com](https://vercel.com) → **Add New → Project** → import the repo. Framework: **Next.js**
   (auto-detected). Click **Deploy**.
3. *(Optional)* In **Project → Settings → Environment Variables**, add `ANTHROPIC_API_KEY` for
   AI-polished wording. It's used only server-side (never exposed to the browser). Without it, the
   built-in parser is used — still works great.
4. Open your `*.vercel.app` URL and click **Check latest release**.

That's the "one click checks for the latest release" you wanted — no server to run.

## CLI setup

```bash
npm install
```

Node 18+ (uses the built-in `fetch`). No config needed. Optional: `cp .env.example .env` and add
`ANTHROPIC_API_KEY` for nicer wording.

---

## Everyday use

```bash
# See what's out there and what you've already handled
node index.js list

# Draft the latest release and copy it straight to your clipboard
node index.js generate --copy

# Draft a specific version
node index.js generate v0.9.14

# Leave it running — it pings you + generates a draft the moment a new release drops
node index.js track --interval=15
```

`generate` prints the message, saves it to `output/<tag>.md`, and with `--copy` puts it on your
clipboard so you can paste it into Discord immediately.

### Tracking in the background

`track` polls every N minutes. When a release you haven't handled appears, it generates the draft and
prints a `🔔 NEW RELEASE` notice. Run `node index.js seed` once first if you don't want it to flag the
release that's *already* out. Use `check` for a one-shot version (no loop).

---

## Commands

| Command | What it does |
|---------|--------------|
| `generate [tag]` | Generate the announcement for the latest release (or a specific tag). Default command. |
| `list [n]` | List the latest `n` releases and flag ones you haven't drafted yet (● = new). |
| `track` | Keep running; alert + generate a draft when a new release drops. Never posts. |
| `check` | One-shot version of `track`. |
| `seed` | Mark the current latest as handled, so `track` only flags newer releases. |
| `post [tag]` | *(optional)* Also post it to Discord yourself — needs the Discord env vars. |

## Flags

- `--copy` — copy the generated announcement to your clipboard.
- `--no-llm` — skip Claude, use the built-in parser (offline, no key).
- `--no-save` — don't write the draft to `output/`.
- `--interval=<min>` — `track` poll interval (default 30).
- `--file=<path>` — render from a saved GitHub release JSON (offline / testing; see `samples/`).

---

## Optional: let it post for you

If you'd rather it also post (still only when *you* run `post`), set these in `.env`:
`DISCORD_TOKEN`, `PRODUCTION_RELEASES_CHANNEL_ID`, and `PRODUCTION_RELEASES_ROLE_ID` (the role to
ping). Then `node index.js post v0.9.14`. Long messages are split into ≤2000-char chunks and
`allowed_mentions` is locked so only the release role can ping (never `@everyone`). Leave these blank
to keep it purely a generator.

## Config (`.env`, all optional)

| Var | Purpose |
|-----|---------|
| `GITHUB_REPO` | Source repo. Default `Graphify-Labs/graphify`. |
| `GITHUB_TOKEN` | Lifts the 60 req/hr anon GitHub limit (any read scope). |
| `ANTHROPIC_API_KEY` | Enables Claude polish. Omit to use the offline parser. |
| `ANTHROPIC_MODEL` | Default `claude-sonnet-4-6`. |
| `PRODUCT_NAME` / `PYPI_PACKAGE` | Shown in the message. Default `Graphify` / `graphifyy`. |
| `RELEASE_ROLE_NAME` | The `@…` text at the top of the message (default `Production Releases`). |
| `DISCORD_*` | Only for the optional `post` command. |
| `MAX_ITEMS_PER_SECTION` | Collapse long sections to `…and N more` (default 10). |
| `CLEAN_STYLE` | Clean Coolify-style bullets — strip `(#123)` refs + `thanks @x` (default `true`; set `false` for dev-detailed). |

## Files

| File | Role |
|------|------|
| `app/` | Next.js web app: `page.js` (UI), `api/announce/route.js` (serverless generator). |
| `index.js` | CLI (generate / list / track / check / seed / post). |
| `github.js` | Fetch/normalize releases (or load from a file). |
| `content.js` | Release notes → grouped `{ intro, sections }` (Claude or parser). Shared by CLI + web. |
| `parse.js` | Built-in notes → grouped sections (offline). |
| `llm.js` | Claude rewrite into the same grouped shape. |
| `channels.js` | Derives the Production / Feature / Security / Beta posts from one release. |
| `format.js` | Renders an announcement. |
| `discord.js` | Optional `post` command (CLI only). |
| `state.js` | Remembers which releases you've handled (so `track`/`list` are accurate). |
| `samples/` | Example release payloads for offline testing. |
