# Graphify announcement canon

Shipped product memory for Discord Studio drafts + images. Not RAG — small JSON/MD that always loads on Vercel.

| Change | Edit |
|--------|------|
| New true fact (date, package, policy) | `facts.json` |
| Claude said something wrong once | Append to `lessons.json` |
| Tone shift | `voice.md` |
| Workspace-wide note | Also update root `MEMORY.md` |

After edits: commit + push `graphify-release-announcer` so Vercel picks it up.
