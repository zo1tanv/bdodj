const {
  AudioPlayerStatus,
  NoSubscriberBehavior,
  StreamType,
  VoiceConnectionStatus,
  createAudioPlayer,
  createAudioResource,
  entersState,
  joinVoiceChannel,
} = require('@discordjs/voice');
const { PermissionFlagsBits } = require('discord.js');
const { spawn } = require('child_process');
const youtubeDl = require('youtube-dl-exec');

function isUrl(value) {
  return /^https?:\/\//i.test(String(value || ''));
}

function formatDuration(seconds) {
  const total = Number(seconds);
  if (!Number.isFinite(total) || total <= 0) return '?:??';
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = Math.floor(total % 60).toString().padStart(2, '0');
  return hours ? `${hours}:${minutes.toString().padStart(2, '0')}:${secs}` : `${minutes}:${secs}`;
}

function firstEntry(data) {
  if (!data) return null;
  if (Array.isArray(data.entries)) return data.entries.find(Boolean) || null;
  return data;
}

function trackFromInfo(info, query, requester) {
  const idUrl = info?.id ? `https://www.youtube.com/watch?v=${info.id}` : query;
  const webpageUrl = info?.webpage_url || info?.original_url || idUrl;
  const durationSeconds = Number(info?.duration) || 0;
  return {
    title: info?.title || query,
    webpageUrl,
    durationSeconds: info?.is_live ? 0 : durationSeconds,
    durationStr: info?.is_live ? 'live' : formatDuration(durationSeconds),
    requester,
  };
}

class MusicPlayer {
  constructor(client, config) {
    this.client = client;
    this.config = config;
    this.queue = [];
    this.currentTrack = null;
    this.voiceChannel = null;
    this.connection = null;
    this.status = 'idle';
    this.lastError = null;
    this.loopRunning = false;
    this.stopped = false;
    this.ffmpeg = null;
    this.updateHandler = null;
    this.progressTimer = null;
    this.currentStartedAt = 0;
    this.currentPausedAt = 0;
    this.pausedTotalMs = 0;
    this.player = createAudioPlayer({
      behaviors: { noSubscriber: NoSubscriberBehavior.Play },
    });

    this.player.on('error', error => {
      this.lastError = error.message;
      console.error('[audio] player error:', error.stack || error.message);
      this.notifyChange();
    });
  }

  setUpdateHandler(handler) {
    this.updateHandler = handler;
  }

  notifyChange() {
    if (!this.updateHandler) return;
    Promise.resolve()
      .then(() => this.updateHandler(this))
      .catch(error => console.error('[panel] update failed:', error.message));
  }

  startProgressTimer() {
    if (this.progressTimer) return;
    this.progressTimer = setInterval(() => {
      if (this.currentTrack && this.status === 'playing' && !this.isPaused()) this.notifyChange();
    }, 10_000);
    this.progressTimer.unref?.();
  }

  stopProgressTimer() {
    if (!this.progressTimer) return;
    clearInterval(this.progressTimer);
    this.progressTimer = null;
  }

  resetProgress() {
    this.currentStartedAt = 0;
    this.currentPausedAt = 0;
    this.pausedTotalMs = 0;
    this.stopProgressTimer();
  }

  getElapsedSeconds() {
    if (!this.currentTrack || !this.currentStartedAt) return 0;
    const now = this.currentPausedAt || Date.now();
    return Math.max(0, Math.floor((now - this.currentStartedAt - this.pausedTotalMs) / 1000));
  }

  getProgress() {
    const elapsedSeconds = this.getElapsedSeconds();
    const durationSeconds = Number(this.currentTrack?.durationSeconds) || 0;
    const percent = durationSeconds > 0 ? Math.min(1, elapsedSeconds / durationSeconds) : 0;
    return {
      elapsedSeconds,
      durationSeconds,
      percent,
      isLive: this.currentTrack?.durationStr === 'live',
    };
  }

  validateVoiceChannel(channel) {
    if (!channel) return { ok: false, error: 'Join a voice channel first.' };
    const permissions = channel.permissionsFor(this.client.user);
    if (!permissions?.has(PermissionFlagsBits.ViewChannel) || !permissions?.has(PermissionFlagsBits.Connect) || !permissions?.has(PermissionFlagsBits.Speak)) {
      return { ok: false, error: 'I need View Channel, Connect, and Speak permissions.' };
    }
    if (this.voiceChannel && this.voiceChannel.id !== channel.id && this.currentTrack) {
      return { ok: false, error: `I am already playing in <#${this.voiceChannel.id}>.` };
    }
    return { ok: true };
  }

  async resolveTrack(query, requester) {
    const target = isUrl(query) ? query : `ytsearch1:${query}`;
    const info = firstEntry(await youtubeDl(target, {
      dumpSingleJson: true,
      noPlaylist: true,
      noWarnings: true,
      noCheckCertificates: true,
      addHeader: [
        'referer:youtube.com',
        'user-agent:Mozilla/5.0',
      ],
    }, { timeout: 45000 }));
    if (!info) throw new Error('Nothing found.');
    return trackFromInfo(info, query, requester);
  }

  async enqueue(query, requester, voiceChannel) {
    const voice = this.validateVoiceChannel(voiceChannel);
    if (!voice.ok) return voice;
    if (this.queue.length >= this.config.maxQueue) return { ok: false, error: 'Queue is full.' };

    this.status = 'resolving';
    this.notifyChange();
    try {
      const track = await this.resolveTrack(query, requester);
      if (!this.currentTrack && !this.loopRunning) {
        this.currentTrack = track;
        this.voiceChannel = voiceChannel;
        this.stopped = false;
        this.resetProgress();
        this.runLoop().catch(error => {
          this.lastError = error.message;
          console.error('[audio] loop crashed:', error.stack || error.message);
          this.notifyChange();
        });
        this.notifyChange();
        return { ok: true, track, queueLength: this.queue.length };
      }
      this.queue.push(track);
      this.notifyChange();
      return { ok: true, track, queueLength: this.queue.length };
    } catch (error) {
      this.status = this.currentTrack ? 'playing' : 'idle';
      this.lastError = error.message;
      this.notifyChange();
      return { ok: false, error: error.message };
    }
  }

  async runLoop() {
    if (this.loopRunning) return;
    this.loopRunning = true;
    try {
      while (this.currentTrack && !this.stopped) {
        await this.playCurrent();
        this.currentTrack = this.queue.shift() || null;
        this.resetProgress();
        this.notifyChange();
      }
    } finally {
      this.loopRunning = false;
      this.status = 'idle';
      this.currentTrack = null;
      this.resetProgress();
      this.notifyChange();
    }
  }

  async ensureConnection() {
    if (this.connection && this.connection.state.status === VoiceConnectionStatus.Ready) {
      return;
    }

    if (this.connection) {
      try {
        this.connection.destroy();
      } catch {}
      this.connection = null;
    }

    this.status = 'connecting';
    this.notifyChange();
    console.log(`[voice] joining ${this.voiceChannel.name || this.voiceChannel.id} (${this.voiceChannel.id})`);
    this.connection = joinVoiceChannel({
      channelId: this.voiceChannel.id,
      guildId: this.voiceChannel.guild.id,
      adapterCreator: this.voiceChannel.guild.voiceAdapterCreator,
      selfDeaf: true,
      selfMute: false,
    });
    this.connection.on('stateChange', (oldState, newState) => {
      console.log(`[voice] state ${oldState.status} -> ${newState.status}`);
    });
    this.connection.on('error', error => {
      this.lastError = error.message;
      console.error('[voice] connection error:', error.stack || error.message);
    });
    try {
      await entersState(this.connection, VoiceConnectionStatus.Ready, this.config.voiceConnectTimeoutMs);
      console.log('[voice] ready');
      this.connection.subscribe(this.player);
      this.notifyChange();
    } catch (error) {
      this.lastError = `Voice connection did not become ready: ${error.message}`;
      console.error(`[voice] failed to reach ready after ${this.config.voiceConnectTimeoutMs}ms:`, error.message);
      try {
        this.connection.destroy();
      } catch {}
      this.connection = null;
      this.notifyChange();
      throw error;
    }
  }

  async connectOnly(voiceChannel) {
    const voice = this.validateVoiceChannel(voiceChannel);
    if (!voice.ok) return voice;
    this.voiceChannel = voiceChannel;
    try {
      await this.ensureConnection();
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  }

  async directAudioUrl(track) {
    const stdout = await youtubeDl(track.webpageUrl, {
      format: 'bestaudio[acodec=opus][ext=webm]/bestaudio[acodec=opus]/bestaudio[ext=webm]/bestaudio/best',
      getUrl: true,
      noPlaylist: true,
      noWarnings: true,
      noCheckCertificates: true,
      addHeader: [
        'referer:youtube.com',
        'user-agent:Mozilla/5.0',
      ],
    }, { timeout: 45000 });
    const urls = String(stdout).trim().split(/\r?\n/).filter(Boolean);
    const url = urls[urls.length - 1];
    if (!url || !isUrl(url)) throw new Error('yt-dlp did not return an audio URL.');
    return url;
  }

  async createResource(track) {
    const url = await this.directAudioUrl(track);
    const volume = Math.max(0, Math.min(2, this.config.defaultVolume / 100)).toFixed(2);
    this.ffmpeg = spawn('ffmpeg', [
      '-hide_banner',
      '-loglevel', 'warning',
      '-reconnect', '1',
      '-reconnect_streamed', '1',
      '-reconnect_delay_max', '5',
      '-i', url,
      '-analyzeduration', '0',
      '-loglevel', '0',
      '-filter:a', `volume=${volume}`,
      '-ar', '48000',
      '-ac', '2',
      '-c:a', 'libopus',
      '-f', 'ogg',
      'pipe:1',
    ], { stdio: ['ignore', 'pipe', 'ignore'] });
    this.ffmpeg.once('error', error => console.error('[ffmpeg] spawn error:', error.message));
    this.ffmpeg.once('close', () => {
      this.ffmpeg = null;
    });
    return createAudioResource(this.ffmpeg.stdout, { inputType: StreamType.OggOpus });
  }

  async playCurrent() {
    await this.ensureConnection();
    this.status = 'buffering';
    this.notifyChange();
    const resource = await this.createResource(this.currentTrack);
    this.status = 'playing';
    this.currentStartedAt = Date.now();
    this.currentPausedAt = 0;
    this.pausedTotalMs = 0;
    this.startProgressTimer();
    this.notifyChange();
    this.player.play(resource);
    await entersState(this.player, AudioPlayerStatus.Playing, 15000).catch(() => {});
    await new Promise(resolve => {
      const cleanup = () => {
        this.player.off(AudioPlayerStatus.Idle, done);
        this.player.off('error', done);
      };
      const done = () => {
        cleanup();
        resolve();
      };
      this.player.once(AudioPlayerStatus.Idle, done);
      this.player.once('error', done);
    });
  }

  pause() {
    if (!this.currentTrack) return false;
    if (this.player.state.status === AudioPlayerStatus.Paused) {
      if (this.currentPausedAt) {
        this.pausedTotalMs += Date.now() - this.currentPausedAt;
        this.currentPausedAt = 0;
      }
      this.player.unpause();
      this.status = 'playing';
      this.startProgressTimer();
    } else {
      this.player.pause(true);
      this.status = 'paused';
      this.currentPausedAt = Date.now();
      this.stopProgressTimer();
    }
    this.notifyChange();
    return true;
  }

  isPaused() {
    return this.player.state.status === AudioPlayerStatus.Paused;
  }

  skip() {
    if (!this.currentTrack) return false;
    if (this.ffmpeg) {
      try {
        this.ffmpeg.kill('SIGKILL');
      } catch {}
      this.ffmpeg = null;
    }
    this.player.stop(true);
    this.stopProgressTimer();
    this.notifyChange();
    return true;
  }

  shuffleQueue() {
    if (this.queue.length < 2) return false;
    for (let i = this.queue.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.queue[i], this.queue[j]] = [this.queue[j], this.queue[i]];
    }
    this.notifyChange();
    return true;
  }

  stop() {
    this.stopped = true;
    this.queue = [];
    this.currentTrack = null;
    this.resetProgress();
    if (this.ffmpeg) {
      try {
        this.ffmpeg.kill('SIGKILL');
      } catch {}
      this.ffmpeg = null;
    }
    this.player.stop(true);
    this.status = 'idle';
    this.notifyChange();
  }

  leave() {
    this.stop();
    if (this.connection) {
      this.connection.destroy();
      this.connection = null;
    }
    this.voiceChannel = null;
    this.notifyChange();
  }
}

module.exports = MusicPlayer;
