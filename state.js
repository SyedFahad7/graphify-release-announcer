const fs = require('fs');
const path = require('path');

const STATE_FILE = path.join(__dirname, 'state.json');

function read() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return { lastAnnouncedTag: null, announced: {} };
  }
}

function write(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function getLastAnnouncedTag() {
  return read().lastAnnouncedTag;
}

function wasAnnounced(tag) {
  return Boolean(read().announced?.[tag]);
}

function markAnnounced(tag) {
  const state = read();
  state.lastAnnouncedTag = tag;
  state.announced = state.announced || {};
  state.announced[tag] = new Date().toISOString();
  write(state);
}

module.exports = { getLastAnnouncedTag, wasAnnounced, markAnnounced };
