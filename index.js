#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const config = require('./config');
const github = require('./github');
const { buildContent } = require('./content');
const { buildAnnouncement } = require('./format');
const { postAnnouncement } = require('./discord');
const state = require('./state');

const OUTPUT_DIR = path.join(__dirname, 'output');

function parseFlags(argv) {
  const flags = {};
  const positional = [];
  for (const a of argv) {
    if (a === '--post') flags.post = true;
    else if (a === '--copy') flags.copy = true;
    else if (a === '--no-llm') flags.noLlm = true;
    else if (a === '--no-save') flags.noSave = true;
    else if (a === '--all') flags.all = true;
    else if (a.startsWith('--interval=')) flags.interval = parseInt(a.split('=')[1], 10);
    else if (a.startsWith('--file=')) flags.file = a.split('=').slice(1).join('=');
    else positional.push(a);
  }
  return { flags, positional };
}

// Copy text to the OS clipboard so the announcement is ready to paste into Discord.
function copyToClipboard(text) {
  let cmd, args;
  if (process.platform === 'win32') {
    cmd = 'clip';
    args = [];
  } else if (process.platform === 'darwin') {
    cmd = 'pbcopy';
    args = [];
  } else {
    cmd = 'xclip';
    args = ['-selection', 'clipboard'];
  }
  try {
    const res = spawnSync(cmd, args, { input: text });
    return res.status === 0;
  } catch {
    return false;
  }
}

function saveOutput(release, text) {
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const file = path.join(OUTPUT_DIR, `${release.tag}.md`);
  fs.writeFileSync(file, text + '\n');
  return file;
}

// Generate the Discord-formatted announcement for a release, print + save + (optional) copy/post.
async function produce(release, flags) {
  console.log(`\nRelease: ${release.name} (${release.tag}) — ${release.url}`);
  if (release.prerelease) console.log('  ⚠️  this is a PRERELEASE');
  if (release.draft) console.log('  ⚠️  this is a DRAFT');

  const { content } = await buildContent(release, {
    noLlm: flags.noLlm,
    log: (m) => console.log(`  ↳ ${m}`),
  });
  const pasteText = buildAnnouncement(release, content, { forPosting: false });

  if (!flags.noSave) {
    const file = saveOutput(release, pasteText);
    console.log(`  ↳ saved → ${path.relative(process.cwd(), file)}`);
  }
  if (flags.copy) {
    const ok = copyToClipboard(pasteText);
    console.log(ok ? '  ↳ 📋 copied to clipboard — ready to paste into Discord' : '  ↳ clipboard copy failed');
  }

  console.log('\n' + '─'.repeat(72));
  console.log(pasteText);
  console.log('─'.repeat(72) + '\n');

  // Optional manual post — only if you explicitly run `post` / pass --post.
  if (flags.post) {
    const postText = buildAnnouncement(release, content, { forPosting: true });
    const n = await postAnnouncement(postText);
    console.log(`  ✅ posted to Discord (${n} message${n > 1 ? 's' : ''}).`);
  }

  state.markAnnounced(release.tag);
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

// Show recent releases and flag which ones you haven't generated a draft for yet.
async function cmdList(positional, flags) {
  const n = parseInt(positional[0], 10) || 10;
  const releases = await github.listReleases(n);
  console.log(`\nLatest ${releases.length} release(s) of ${config.githubRepo}:\n`);
  for (const r of releases) {
    const seen = state.wasAnnounced(r.tag);
    const marker = seen ? '   ' : ' ● ';
    const tags = [];
    if (r.prerelease) tags.push('prerelease');
    if (r.draft) tags.push('draft');
    const label = tags.length ? `  [${tags.join(', ')}]` : '';
    const date = r.publishedAt ? r.publishedAt.slice(0, 10) : '—';
    const status = seen ? 'done' : 'NEW — no draft yet';
    console.log(`${marker}${r.tag.padEnd(12)} ${date}  ${status}${label}`);
  }
  console.log(`\n● = you haven't generated an announcement for it yet.`);
  console.log(`Run:  node index.js generate <tag>   (add --copy to copy it to your clipboard)\n`);
}

// One local check: if the latest release is new (no draft yet), generate a draft. Never posts.
async function runOnce(flags) {
  const release = await github.getLatestRelease();
  if (state.wasAnnounced(release.tag)) {
    console.log(`[${new Date().toLocaleString()}] latest is ${release.tag} — already drafted. Nothing new.`);
    return false;
  }
  console.log(`\n🔔  NEW RELEASE: ${release.tag} — generating your Discord draft…`);
  await produce(release, { ...flags, post: false });
  console.log('👉  Draft is in output/ (and on your clipboard if you passed --copy). Paste it when ready.\n');
  return true;
}

// Mark the current latest release as already-handled WITHOUT generating a draft,
// so `track` only alerts you about releases that come out AFTER you start tracking.
async function cmdSeed() {
  const release = await github.getLatestRelease();
  state.markAnnounced(release.tag);
  console.log(`Seeded: ${release.tag} marked as handled. 'track' will now only flag NEWER releases.`);
}

async function cmdCheck(flags) {
  try {
    await runOnce(flags);
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

async function cmdTrack(flags) {
  const intervalMin = flags.interval || 30;
  console.log(
    `Tracking ${config.githubRepo} for new releases every ${intervalMin} min.\n` +
      `When one drops, a ready-to-paste Discord draft is generated in output/ and printed here.\n` +
      `(This never posts anywhere — it just prepares the message for you.)\n` +
      `Tip: run 'node index.js seed' first if you don't want the current release flagged.\n`
  );

  const tick = () =>
    runOnce(flags).catch((err) =>
      console.error(`[${new Date().toLocaleString()}] track error: ${err.message}`)
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
    case 'list':
    case 'releases':
      await cmdList(positional, flags);
      break;
    case 'track':
    case 'watch':
      await cmdTrack(flags);
      break;
    case 'check':
    case 'once':
      await cmdCheck(flags);
      break;
    case 'seed':
      await cmdSeed();
      break;
    case 'post':
      await cmdGenerate(positional, { ...flags, post: true });
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
  console.log(`graphify-release-announcer — your personal release tracker + Discord message generator

It watches the Graphify repo's releases and hands you a ready-to-paste, Coolify-style
#production-releases announcement. It does NOT post anything on its own.

Usage:
  node index.js generate [tag]     Generate the Discord announcement for the latest (or a tag)
  node index.js list [n]           List the latest n releases; flags ones you haven't drafted yet
  node index.js track              Keep running; alert + generate a draft when a NEW release drops
  node index.js check              One-shot version of track (generate a draft if latest is new)
  node index.js seed               Mark the current latest as handled (so 'track' only flags newer ones)
  node index.js post [tag]         (optional) Also post it to Discord yourself — needs Discord env

Flags:
  --copy            Copy the generated announcement to your clipboard (ready to paste)
  --no-llm          Skip Claude; use the built-in parser (works offline, no API key)
  --no-save         Don't write the draft to output/
  --interval=N      track: minutes between checks (default 30)
  --file=<path>     Render from a saved release JSON (offline / testing)

Examples:
  node index.js generate --copy        # draft the latest release, straight to your clipboard
  node index.js generate v0.9.14       # draft a specific version
  node index.js list                   # what releases are out, and which I've handled
  node index.js track --interval=15    # sit in the background, ping me when a release drops`);
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
