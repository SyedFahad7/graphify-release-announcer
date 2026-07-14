const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Pin the workspace root to this folder (a stray package-lock.json exists in the home dir).
  turbopack: {
    root: __dirname,
  },
};

module.exports = nextConfig;
