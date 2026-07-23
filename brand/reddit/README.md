# Graphify Reddit pack (runtime)

Shipped with the Vercel app. Used by `lib/reddit-pack.js` + `reddit-llm.js` for the **Reddit** studio tab.

| File | Purpose |
|------|---------|
| `voice.md` | Length, register, subtlety ladder, grounding rules |
| `bans.md` | Claude-isms, hard-sell, Discord leakage |
| `formulas.md` | Angle templates (builder / milestone / discussion / …) |
| `subs.json` | Curated subreddits + promo policy notes |

Edit → commit → redeploy. For full interactive Reddit skills in Cursor chats, see workspace `.cursor/skills/reddit-*`.

**Paste-only.** Nothing posts to Reddit automatically.

Distilled from:
- [niveshdandyan/reddit-post-skill](https://github.com/niveshdandyan/reddit-post-skill)
- [piupiuyao/reddit-founder-skill](https://github.com/piupiuyao/reddit-founder-skill)
- [cskwork/reddit-skill](https://github.com/cskwork/reddit-skill) (writing rules only)
