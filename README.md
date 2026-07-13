# graphify-release-announcer

Turns a **Graphify GitHub release** into a **ready-to-paste, Coolify-style `#production-releases`
Discord announcement** — so you can post the moment a prod release drops.

It pulls the release notes from `Graphify-Labs/graphify`, rewrites the messy changelog into clean,
grouped, human-friendly highlights (✨ New Features · 🐛 Notable Bug Fixes · 🔒 Security Fixes ·
⚠️ Breaking Changes · 🛠️ Integrations/Exports), and either **prints a draft for you to copy-paste**
or **posts it straight to Discord**.

> Inspired by how the Coolify team announces releases in their `#production-releases` channel:
> a role ping, a one-line summary, then grouped highlights and a link to the full notes.

---

## How it works

1. **Fetch** the target release from GitHub (latest, or a specific tag).
2. **Rewrite** the notes into grouped highlights:
   - **With `ANTHROPIC_API_KEY`** → Claude rewrites the notes into tight, community-friendly bullets.
   - **Without a key** → a deterministic parser categorizes the notes (works offline, no cost).
3. **Output** a ready-to-paste `.md` draft (in `output/`) and/or **post** it to `#production-releases`.

The LLM is optional. The deterministic fallback already produces a solid, correctly-grouped post.

---

## Setup

```bash
cd graphify-release-announcer
npm install
cp .env.example .env   # edit values (only needed for --post and/or LLM polish)
```

Node 18+ is required (uses the built-in `fetch`).

### `.env` (all optional except when posting)

| Var | Purpose |
|-----|---------|
| `GITHUB_REPO` | Source repo. Default `Graphify-Labs/graphify`. |
| `GITHUB_TOKEN` | Lifts the 60 req/hr anon GitHub limit (any read scope). |
| `ANTHROPIC_API_KEY` | Enables Claude polish. Omit to use the offline parser. |
| `ANTHROPIC_MODEL` | Default `claude-sonnet-4-6`. |
| `DISCORD_TOKEN` | Bot token (only for `--post` / `watch`). |
| `PRODUCTION_RELEASES_CHANNEL_ID` | The `#production-releases` channel id. |
| `PRODUCTION_RELEASES_ROLE_ID` | Role to actually ping at the top. Blank = plain `@Production Releases` text (no ping). |
| `MAX_ITEMS_PER_SECTION` | Collapse long sections to `…and N more` (default 10). |
| `KEEP_THANKS` | Keep `(thanks @contributor)` credits (default `true`). |

---

## Usage

```bash
# Draft for the latest release → prints + saves output/<tag>.md
node index.js generate

# Draft for a specific tag
node index.js generate v0.9.14

# Draft AND post to #production-releases (needs Discord env)
node index.js post v0.9.14

# Preview what would be posted, without sending
node index.js generate v0.9.14 --post --dry

# Skip Claude, use the offline parser
node index.js generate --no-llm

# Render from a saved release JSON (offline / testing)
node index.js generate --file=samples/v0.9.14.json --no-llm

# Watch for new releases and auto-post/draft when one appears
node index.js watch --interval=15

# One-shot for cron/CI: post the latest release only if it's new, then exit
node index.js check

# First-time setup: mark the current latest release as done so it isn't re-announced
node index.js seed
```

### Flags

- `--post` — also post to Discord (`generate`/`latest`).
- `--dry` — with `--post`, build the message but don't send.
- `--no-llm` — force the deterministic parser.
- `--no-save` — don't write the draft to `output/`.
- `--file=<path>` — render from a saved GitHub release JSON instead of fetching.
- `--interval=<min>` — `watch` poll interval (default 30).

---

## Typical DevRel flow

1. Safi cuts a release on GitHub.
2. Run `node index.js generate` (or leave `watch` running).
3. Skim the draft in `output/<tag>.md`, tweak the intro if you want a warmer opener.
4. Paste into `#production-releases` — or let `--post` / `watch` do it for you.

The top line renders as a real role ping (`<@&ROLE_ID>`) **only when posting** and only for the
configured role; the saved `.md` uses a plain `@Production Releases` so nothing pings while you edit.

---

## Auto-post from GitHub Actions (recommended)

`.github/workflows/announce.yml` runs `node index.js check` on a schedule (every 30 min) and posts
any new release to `#production-releases` — no server to keep running. State (which tags were already
announced) is persisted between runs via the Actions cache, the same trick the social-bot uses.

**Setup (once you push this folder as its own repo):**

1. Add repo **secrets** (Settings → Secrets and variables → Actions → *Secrets*):
   - `DISCORD_TOKEN`
   - `PRODUCTION_RELEASES_CHANNEL_ID`
   - `PRODUCTION_RELEASES_ROLE_ID` (the role to ping)
   - `ANTHROPIC_API_KEY` *(optional — omit to use the offline parser)*
2. Optionally add **variables** (*Variables* tab) to override defaults: `GITHUB_REPO`, `PRODUCT_NAME`,
   `PYPI_PACKAGE`, `RELEASE_ROLE_NAME`, `ANTHROPIC_MODEL`. Sensible defaults are baked in.
3. **Seed first** so it doesn't re-announce the release that's already out: run the workflow manually
   (Actions → *Release Announcer* → *Run workflow* → **mode: `seed`**). After that, every *new* release
   auto-posts within ~30 min.
4. The manual run also offers **mode: `dry`** (build but don't post) to preview.

GitHub reads use the workflow's built-in token, so there's no extra GitHub PAT to create.

> Runs only cost an LLM call when there's actually a new release; empty checks are a single GitHub API request.

## Discord notes

- Posts via the Discord REST API (`Bot` token) — no gateway/`discord.js` dependency.
- Long announcements are split into ≤2000-char messages on paragraph boundaries (code blocks stay intact).
- `allowed_mentions` is locked down: only the configured release role can be pinged (never `@everyone`).

## Files

| File | Role |
|------|------|
| `index.js` | CLI entry (generate / post / watch). |
| `github.js` | Fetch/normalize releases (or load from a file). |
| `parse.js` | Deterministic notes → grouped sections (offline fallback). |
| `llm.js` | Claude rewrite into the same grouped shape. |
| `format.js` | Renders the announcement + Discord chunking. |
| `discord.js` | Posts to `#production-releases`. |
| `state.js` | Tracks the last announced tag (so `watch` doesn't repeat). |
| `samples/` | Example release payloads for offline testing. |
