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

## Official logos ONLY (hard rule)

The runtime **embeds PNG brand assets** from `brand/logos/`. You must **never draw**:

- A letter G, hexagon-G, serif-G, node-cluster pretending to be the mark
- A fake “GRAPHIFY” wordmark made of SVG text paths meant to look like the logo
- Any substitute mark

Choose among real assets:

| Key | Asset |
|-----|--------|
| `icon` | Wireframe graph-G mark (`icons/*`) |
| `wordmark` | Graphify wordmark (`wordmark/*`) |
| `full` | Mark + wordmark lockup (`full/*`) |

Tone: `white-on-dark` → white transparent PNGs · `ink-on-cream` → black transparent PNGs.

In the SVG, place **only** these HTML comments (the server replaces them with real `<image>` tags):

- `<!--GRAPHIFY_LOGO_PRIMARY-->`
- `<!--GRAPHIFY_LOGO_SECONDARY-->` (optional)

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
