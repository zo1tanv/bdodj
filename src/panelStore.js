const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const STORE_FILE = path.join(DATA_DIR, 'panels.json');

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readStore() {
  try {
    ensureDataDir();
    return JSON.parse(fs.readFileSync(STORE_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function writeStore(store) {
  ensureDataDir();
  fs.writeFileSync(STORE_FILE, `${JSON.stringify(store, null, 2)}\n`);
}

function getPanel(guildId) {
  return readStore()[guildId] || null;
}

function setPanel(guildId, panel) {
  const store = readStore();
  store[guildId] = panel;
  writeStore(store);
}

function deletePanel(guildId) {
  const store = readStore();
  delete store[guildId];
  writeStore(store);
}

module.exports = { deletePanel, getPanel, setPanel };
