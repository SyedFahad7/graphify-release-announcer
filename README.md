# graphify-release-announcer

Your **personal release tracker + Discord message generator** for Graphify.

It watches the Graphify repo's releases and, whenever one drops, hands you a **ready-to-paste,
Coolify-style `#production-releases` announcement** — a role ping, a one-line summary, then clean
grouped highlights and a link to the full notes. You review it and paste it into Discord yourself.

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

## Setup

```bash
cd graphify-release-announcer
npm install
```

Node 18+ (uses the built-in `fetch`). No config needed to start. Optional: `cp .env.example .env`
and add `ANTHROPIC_API_KEY` for nicer wording.

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
| `KEEP_THANKS` | Keep `(thanks @contributor)` credits (default `true`). |

## Files

| File | Role |
|------|------|
| `index.js` | CLI (generate / list / track / check / seed / post). |
| `github.js` | Fetch/normalize releases (or load from a file). |
| `parse.js` | Built-in notes → grouped sections (offline). |
| `llm.js` | Claude rewrite into the same grouped shape. |
| `format.js` | Renders the announcement. |
| `discord.js` | Optional `post` command. |
| `state.js` | Remembers which releases you've handled (so `track`/`list` are accurate). |
| `samples/` | Example release payloads for offline testing. |
