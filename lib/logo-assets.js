const fs = require('fs');
const path = require('path');

const LOGO_FILES = {
  icon: { white: 'icons/white-no_bg.png', black: 'icons/black-no_bg.png' },
  wordmark: { white: 'wordmark/white-no_bg.png', black: 'wordmark/black-no_bg.png' },
  full: { white: 'full/white-no_bg.png', black: 'full/black-no_bg.png' },
};

function firstExisting(...candidates) {
  for (const p of candidates) {
    if (p && fs.existsSync(p)) return p;
  }
  return null;
}

function resolveBrandFile(...parts) {
  const rel = path.join(...parts);
  return firstExisting(
    path.join(process.cwd(), 'brand', rel),
    path.join(__dirname, '..', 'brand', rel),
    path.join(__dirname, 'brand', rel)
  );
}

function resolveLogoRoot() {
  const probe = 'icons/white-no_bg.png';
  const file = resolveBrandFile('logos', ...probe.split('/'));
  if (!file) {
    throw new Error(`Missing brand logo asset: ${probe}`);
  }
  return path.dirname(path.dirname(file));
}

let LOGO_ROOT = null;
function getLogoRoot() {
  if (!LOGO_ROOT) LOGO_ROOT = resolveLogoRoot();
  return LOGO_ROOT;
}

let EMBEDDED = null;
function embeddedLogos() {
  if (EMBEDDED) return EMBEDDED;
  try {
    EMBEDDED = require('../brand/logo-assets');
  } catch {
    EMBEDDED = {};
  }
  return EMBEDDED;
}

function logoTone(treatment) {
  return treatment === 'ink-on-cream' ? 'black' : 'white';
}

function readLogoBase64(kind, treatment) {
  const k = LOGO_FILES[kind] ? kind : 'icon';
  const rel = LOGO_FILES[k][logoTone(treatment)];
  const fromBundle = embeddedLogos()[rel];
  if (fromBundle) return fromBundle;
  const file = path.join(getLogoRoot(), rel);
  if (fs.existsSync(file)) return fs.readFileSync(file).toString('base64');
  const alt = resolveBrandFile('logos', ...rel.split('/'));
  if (alt) return fs.readFileSync(alt).toString('base64');
  throw new Error(`Missing brand logo asset: ${rel}`);
}

function logoDataUri(kind, treatment) {
  return `data:image/png;base64,${readLogoBase64(kind, treatment)}`;
}

module.exports = {
  LOGO_FILES,
  readLogoBase64,
  logoDataUri,
  logoTone,
  resolveBrandFile,
};
