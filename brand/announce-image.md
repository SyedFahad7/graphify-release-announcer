# Graphify announcement image brief (runtime)

Injected into Claude for Discord Studio “Create image too”.

## Brand feel — terminal-luxury (premium, not AI slop)

Warm cream paper, green-black ink, cinematic deep-green heroes. Restrained, confident, quietly technical.
Agency craft bar: one signature, macro whitespace, intentional asymmetry. Not a centered template card.

## Tokens

- Cream bg `#f8f7f0` · Ink `#16211b` · Card `#fdfcf6` · Border `#e0e2d3`
- Amber memory `#c6841c` · Verify `#0e9e76` · Verify on dark `#3fd7a2` · Witness `#b3402a`
- Hero greens `#062a22 → #0a3f31 → #124f3c → #1e6149 → #4f8a68 → #a8c9ad → cream`
- Footer / near-black green `#052019`

## Official logos + layout (hard rule)

Claude supplies **mood + short copy only**. The server (`lib/poster-svg.js`) composes the SVG:

- Official PNGs from `brand/logos` / `logo-assets.js` (icon + full lockup)
- Fixed non-overlapping zones (number posters never put a paragraph beside the hero numeral)
- No freeform Claude SVG (that caused overlapping / hallucinated type)

## Mood picker

- `hero-green` — milestone / celebration
- `ink-black` — product punch / geometric
- `cream-paper` — calm trust / security
- `terminal` — release teaser

## Composition (anti-slop)

Square 1024×1024. Prefer **asymmetric** layouts over dead-center stacks.
Hero budget: official logo + one headline idea + one short line. Atmosphere OR geometry — not both screaming.
Avoid: purple, neon glow soup, faint uniform node grids as filler, `v2025`-style junk footnotes, invented metrics.

## Type

Tight grotesque display (system-ui / sans-serif OK in SVG). Mono UPPERCASE eyebrows, tracked.
One amber highlight phrase max.
