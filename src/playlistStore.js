const { readJson, writeJson } = require('./jsonStore');

const FILE = 'playlists.json';
const MAX_PLAYLISTS_PER_SCOPE = 30;
const MAX_TRACKS_PER_PLAYLIST = 100;

function emptyStore() {
  return {};
}

function load() {
  return readJson(FILE, emptyStore());
}

function save(store) {
  writeJson(FILE, store);
}

function slug(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9а-яё_-]+/giu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
}

function scopeKey(scope, userId) {
  return scope === 'personal' ? `user:${userId}` : 'server';
}

function guildBucket(store, guildId) {
  if (!store[guildId]) store[guildId] = { scopes: {} };
  if (!store[guildId].scopes) store[guildId].scopes = {};
  return store[guildId];
}

function scopeBucket(store, guildId, scope, userId) {
  const guild = guildBucket(store, guildId);
  const key = scopeKey(scope, userId);
  if (!guild.scopes[key]) guild.scopes[key] = { playlists: {} };
  if (!guild.scopes[key].playlists) guild.scopes[key].playlists = {};
  return guild.scopes[key];
}

function createPlaylist(guildId, scope, userId, name) {
  const id = slug(name);
  if (!id) return { ok: false, error: 'Playlist name is empty.' };

  const store = load();
  const bucket = scopeBucket(store, guildId, scope, userId);
  if (!bucket.playlists[id] && Object.keys(bucket.playlists).length >= MAX_PLAYLISTS_PER_SCOPE) {
    return { ok: false, error: `Playlist limit is ${MAX_PLAYLISTS_PER_SCOPE}.` };
  }

  if (!bucket.playlists[id]) {
    bucket.playlists[id] = {
      id,
      name: String(name).trim().slice(0, 80),
      createdBy: userId,
      tracks: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    save(store);
  }

  return { ok: true, playlist: bucket.playlists[id] };
}

function listPlaylists(guildId, scope, userId) {
  const store = load();
  const bucket = scopeBucket(store, guildId, scope, userId);
  return Object.values(bucket.playlists)
    .sort((a, b) => String(a.name).localeCompare(String(b.name)))
    .map(playlist => ({ ...playlist, scope }));
}

function getPlaylist(guildId, scope, userId, idOrName) {
  const store = load();
  const bucket = scopeBucket(store, guildId, scope, userId);
  const id = slug(idOrName);
  return bucket.playlists[id] ? { ...bucket.playlists[id], scope } : null;
}

function deletePlaylist(guildId, scope, userId, idOrName) {
  const store = load();
  const bucket = scopeBucket(store, guildId, scope, userId);
  const id = slug(idOrName);
  if (!bucket.playlists[id]) return false;
  delete bucket.playlists[id];
  save(store);
  return true;
}

function addTrack(guildId, scope, userId, name, track) {
  const created = createPlaylist(guildId, scope, userId, name);
  if (!created.ok) return created;
  const store = load();
  const bucket = scopeBucket(store, guildId, scope, userId);
  const playlist = bucket.playlists[created.playlist.id];
  if (playlist.tracks.length >= MAX_TRACKS_PER_PLAYLIST) {
    return { ok: false, error: `Track limit is ${MAX_TRACKS_PER_PLAYLIST}.` };
  }
  playlist.tracks.push({
    title: String(track.title || track.query).slice(0, 120),
    query: String(track.query || track.webpageUrl || track.title).slice(0, 500),
    addedBy: userId,
    addedAt: new Date().toISOString(),
  });
  playlist.updatedAt = new Date().toISOString();
  save(store);
  return { ok: true, playlist };
}

module.exports = {
  MAX_PLAYLISTS_PER_SCOPE,
  MAX_TRACKS_PER_PLAYLIST,
  addTrack,
  createPlaylist,
  deletePlaylist,
  getPlaylist,
  listPlaylists,
  slug,
};
