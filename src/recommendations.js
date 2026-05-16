const { readJson } = require('./jsonStore');

function catalog() {
  const data = readJson('recommendations.json', { categories: [] });
  const categories = Array.isArray(data.categories) ? data.categories : [];
  return categories.map(category => ({
    id: String(category.id || '').slice(0, 60),
    label: String(category.label || category.id || 'Category').slice(0, 100),
    description: String(category.description || '').slice(0, 100),
    tracks: Array.isArray(category.tracks) ? category.tracks : [],
  })).filter(category => category.id && category.tracks.length);
}

function categories() {
  return catalog();
}

function categoryById(id) {
  return catalog().find(category => category.id === id) || null;
}

function trackByValue(categoryId, value) {
  const category = categoryById(categoryId);
  if (!category) return null;
  const index = Number(value);
  if (!Number.isInteger(index) || index < 0 || index >= category.tracks.length) return null;
  const track = category.tracks[index];
  if (!track?.query) return null;
  return {
    title: String(track.title || track.query),
    query: String(track.query),
  };
}

module.exports = { categories, categoryById, trackByValue };
