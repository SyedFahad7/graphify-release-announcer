#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const config = require('./config');
const github = require('./github');
const { parseReleaseBody } = require('./parse');
const { polishWithLLM } = require('./llm');
const { buildAnnouncement } = require('./format');
const { postAnnouncement } = require('./discord');
const state = require('./state');

const OUTPUT_DIR = path.join(__dirname, 'output');

function parseFlags(argv) {
  const flags = {};
  const positional = [];
  for (const a of argv) {
    if (a === '--post') flags.post = true;
    else if (a === '--dry') flags.dry = true;
    else if (a === '--no-llm') flags.noLlm = true;
    else if (a === '--no-save') flags.noSave = true;
    else if (a.startsWith('--interval=')) flags.interval = parseInt(a.split('=')[1], 10);
    else if (a.startsWith('--file=')) flags.file = a.split('=').slice(1).join('=');
    else positional.push(a);
  }
  return { flags, positional };
}

// Build { intro, sections } — LLM first, deterministic parser as fallback.
async function buildContent(release, noLlm) {
  if (!noLlm && config.anthropicApiKey) {
    try {
      const content = await polishWithLLM(release);
      const total = Object.values(content.sections).reduce((n, a) => n + a.length, 0);
      if (total > 0 || content.intro) {
        console.log('  ↳ notes polished with Claude');
        return content;
      }
      console.log('  ↳ LLM returned nothing usable, using parser');
    } catch (err) {
      console.log(`  ↳ LLM polish failed (${err.message}); using parser`);
    }
  } else if (!noLlm) {
    console.log('  ↳ no ANTHROPIC_API_KEY, using deterministic parser');
  }
  return parseReleaseBody(release.body);
}

function saveOutput(release, text) {
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const file = path.join(OUTPUT_DIR, `${release.tag}.md`);
  fs.writeFileSync(file, text + '\n');
  return file;
}

async function produce(release, flags) {
  console.log(`\nRelease: ${release.name} (${release.tag}) — ${release.url}`);
  if (release.prerelease) console.log('  ⚠️  this is a PRERELEASE');
  if (release.draft) console.log('  ⚠️  this is a DRAFT');

  const content = await buildContent(release, flags.noLlm);

  // Copy-paste version (plain @mention) always written to file + console.
  const pasteText = buildAnnouncement(release, content, false);

  if (!flags.noSave) {
    const file = saveOutput(release, pasteText);
    console.log(`  ↳ saved ready-to-paste announcement → ${path.relative(process.cwd(), file)}`);
  }

  console.log('\n' + '─'.repeat(72));
  console.log(pasteText);
  console.log('─'.repeat(72) + '\n');

  if (flags.post && !flags.dry) {
    const postText = buildAnnouncement(release, content, true); // real role ping
    const n = await postAnnouncement(postText);
    state.markAnnounced(release.tag);
    console.log(`  ✅ posted to #production-releases (${n} message${n > 1 ? 's' : ''}).`);
  } else if (flags.post && flags.dry) {
    console.log('  (dry run — not posting to Discord)');
  }

  return pasteText;
}

async function cmdGenerate(positional, flags) {
  const tag = positional[0];
  let release;
  if (flags.file) release = github.getReleaseFromFile(flags.file);
  else if (tag) release = await github.getReleaseByTag(tag);
  else release = await github.getLatestRelease();
  await produce(release, flags);
}

// One poll: if the latest release hasn't been announced yet, produce (+post) it.
// Returns true if a new release was handled. Used by both `check` and `watch`.
async function runOnce(flags) {
  const release = await github.getLatestRelease();
  if (state.wasAnnounced(release.tag)) {
    console.log(`[${new Date().toISOString()}] latest ${release.tag} already handled — nothing to do.`);
    return false;
  }
  console.log(`[${new Date().toISOString()}] NEW release detected: ${release.tag}`);
  const canPost = Boolean(config.discordToken && config.channelId) && !flags.dry;
  await produce(release, { ...flags, post: canPost });
  // Mark announced even in draft-only mode so a cron doesn't re-alert every run.
  if (!canPost) state.markAnnounced(release.tag);
  return true;
}

// Mark the current latest release as already-announced WITHOUT posting.
// Run this once on first setup so the cron doesn't re-announce an existing release.
async function cmdSeed() {
  const release = await github.getLatestRelease();
  state.markAnnounced(release.tag);
  console.log(`Seeded: ${release.tag} marked as announced (will NOT be posted). Future releases will post.`);
}

// Single-shot poll for cron / CI (GitHub Actions). Exits after one check.
async function cmdCheck(flags) {
  try {
    await runOnce(flags);
  } catch (err) {
    console.error(`[${new Date().toISOString()}] check error: ${err.message}`);
    process.exit(1);
  }
}

async function cmdWatch(flags) {
  const intervalMin = flags.interval || 30;
  console.log(
    `Watching ${config.githubRepo} for new releases every ${intervalMin} min.` +
      (config.discordToken && config.channelId
        ? ' New releases will be posted to #production-releases.'
        : ' No Discord configured — will only save drafts to output/.')
  );

  const tick = () =>
    runOnce(flags).catch((err) =>
      console.error(`[${new Date().toISOString()}] watch error: ${err.message}`)
    );

  await tick();
  setInterval(tick, intervalMin * 60 * 1000);
}

async function main() {
  const [, , cmd, ...rest] = process.argv;
  const { flags, positional } = parseFlags(rest);

  switch (cmd) {
    case undefined:
    case 'generate':
    case 'latest':
      await cmdGenerate(positional, flags);
      break;
    case 'post':
      await cmdGenerate(positional, { ...flags, post: true });
      break;
    case 'check':
    case 'once':
      await cmdCheck(flags);
      break;
    case 'seed':
      await cmdSeed();
      break;
    case 'watch':
      await cmdWatch(flags);
      break;
    case 'help':
    case '--help':
    case '-h':
      printHelp();
      break;
    default:
      console.error(`Unknown command: ${cmd}\n`);
      printHelp();
      process.exit(1);
  }
}

function printHelp() {
  console.log(`graphify-release-announcer — Coolify-style #production-releases posts

Usage:
  node index.js generate [tag]     Build announcement for latest (or a tag), print + save to output/
  node index.js post [tag]         Build AND post it to #production-releases (needs Discord env)
  node index.js check              One-shot: post the latest release if it's new, then exit (for cron/CI)
  node index.js seed               Mark the current latest release as announced WITHOUT posting (first-time setup)
  node index.js watch              Poll for new releases; auto-post/draft when one appears

Flags:
  --post            Also post to Discord (generate/latest only)
  --dry             With --post: build the post text but don't send
  --no-llm          Skip Claude; use the deterministic parser
  --no-save         Don't write the draft to output/
  --interval=N      watch: minutes between polls (default 30)

Examples:
  node index.js generate            # draft for the latest release
  node index.js generate v0.9.14    # draft for a specific tag
  node index.js post v0.9.14        # draft + post it
  node index.js watch --interval=15 # poll every 15 min and auto-post`);
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
