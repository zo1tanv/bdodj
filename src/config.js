const dotenv = require('dotenv');
dotenv.config();

function numberEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
}

module.exports = {
  token: process.env.BDODJ_TOKEN || process.env.DISCORD_TOKEN,
  prefix: process.env.BDODJ_PREFIX || '!',
  activity: process.env.BDODJ_ACTIVITY || 'BDO Radio',
  defaultVolume: numberEnv('BDODJ_DEFAULT_VOLUME', 60),
  maxQueue: numberEnv('BDODJ_MAX_QUEUE', 100),
  voiceConnectTimeoutMs: numberEnv('BDODJ_VOICE_CONNECT_TIMEOUT_MS', 30000),
};
