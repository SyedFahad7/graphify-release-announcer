const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Pin the workspace root to this folder (a stray package-lock.json exists in the home dir).
  turbopack: {
    root: __dirname,
  },
  // Serverless/NFT otherwise skips brand PNGs (dynamic fs paths). Keep them in the
  // /api/announcements lambda so Create image too can inject official logos.
  outputFileTracingIncludes: {
    '/api/announcements': [
      './brand/logos/**/*',
      './brand/logo-assets.js',
      './brand/announce-image.md',
      './brand/announce-voice.md',
      './brand/canon/**/*',
      './brand/graphify-design-dna.json',
      './brand/design-dna/**/*',
      './lib/canon.js',
    ],
  },
};

module.exports = nextConfig;
