const { readJson, writeJson } = require('./jsonStore');

const FILE = 'settings.json';

function load() {
  return readJson(FILE, {});
}

function save(settings) {
  writeJson(FILE, settings);
}

function guildSettings(guildId) {
  return load()[guildId] || {};
}

function setGuildVolume(guildId, volumeLevel) {
  const settings = load();
  if (!settings[guildId]) settings[guildId] = {};
  settings[guildId].volumeLevel = Math.min(10, Math.max(1, Number(volumeLevel) || 6));
  save(settings);
  return settings[guildId].volumeLevel;
}

module.exports = { guildSettings, setGuildVolume };
