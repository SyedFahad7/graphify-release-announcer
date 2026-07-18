# graphify-release-announcer (Discord Studio)

Your **personal Discord draft studio** for Graphify. Two surfaces on one Vercel site:

1. **Releases** — Coolify-style `#production-releases` posts (single tag or combine 2–4).
2. **Announcements** — `#announcements` drafts from Safi’s X, `@graphify`, star milestones
   (80k / 90k / 100k), and the latest release teaser. Compose from a tweet/release URL too.

**It does not post anything on its own.** You copy and paste.

CLI still covers the release tracker (`generate`, `list`, `track`, `combine`, `--copy`).

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

Open the site:

- **Releases** → **Check latest release** (or Combine 2–4) → Copy into `#production-releases`.
- **Announcements** → **Check for news** → pick a signal → **Draft announcement** → Copy into `#announcements`.

Toggle **Skip AI** to use templates / the built-in release parser (no Anthropic key).

### Deploy to Vercel (one-click site)

1. Push this repo to GitHub (`SyedFahad7/graphify-release-announcer`).
2. On [vercel.com](https://vercel.com) → **Add New → Project** → import the repo. Framework: **Next.js**.
3. In **Project → Settings → Environment Variables**, add (server-side only):

| Variable | Why |
|----------|-----|
| `ANTHROPIC_API_KEY` | Claude wording for releases + announcements |
| `TWITTER_BEARER_TOKEN` | Same token as `graphify-social-bot` / `graphify-tweet-agent` (X read) |
| `GITHUB_TOKEN` | Higher GitHub rate limit for stars + releases |
| `DISCORD_NITRO=true` | Optional; 3900-char fit if your account has Nitro |
| `ANNOUNCE_HANDLES` | Default `safishamsii,graphify` |
| `STAR_MILESTONES` | Default `80000,90000,100000` |
| `ANNOUNCE_PING` | Default `@everyone` (or an opt-in role text) |

4. Open your `*.vercel.app` URL → **Announcements** → **Check for news**.

Copy `TWITTER_BEARER_TOKEN` from `graphify-social-bot/.env` (do not commit it).

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
| `MAX_ITEMS_PER_SECTION` | Cap bullets per section (default `0` = show all; auto-fit trims to Discord's limit). |
| `POST_THEME` | `peak` (H1 + emoji headers) or `shadow` (inline title + hollow nested bullets). |
| `DISCORD_CHAR_LIMIT` | Auto-trim to fit one Discord message (default `1990`). |
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
