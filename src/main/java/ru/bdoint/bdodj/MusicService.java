package ru.bdoint.bdodj;

import com.sedmelluq.discord.lavaplayer.player.AudioLoadResultHandler;
import com.sedmelluq.discord.lavaplayer.player.AudioPlayer;
import com.sedmelluq.discord.lavaplayer.player.AudioPlayerManager;
import com.sedmelluq.discord.lavaplayer.tools.FriendlyException;
import com.sedmelluq.discord.lavaplayer.track.AudioPlaylist;
import com.sedmelluq.discord.lavaplayer.track.AudioTrack;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Consumer;
import net.dv8tion.jda.api.audio.hooks.ConnectionListener;
import net.dv8tion.jda.api.audio.hooks.ConnectionStatus;
import net.dv8tion.jda.api.entities.Guild;
import net.dv8tion.jda.api.entities.User;
import net.dv8tion.jda.api.entities.VoiceChannel;
import net.dv8tion.jda.api.managers.AudioManager;

final class MusicService {
  private final AudioPlayerManager audioManager;
  private final BotConfig config;
  private final Map<Long, GuildMusicManager> managers = new ConcurrentHashMap<>();

  MusicService(AudioPlayerManager audioManager, BotConfig config) {
    this.audioManager = audioManager;
    this.config = config;
  }

  GuildMusicManager manager(Guild guild) {
    return managers.computeIfAbsent(guild.getIdLong(), guildId -> {
      AudioPlayer player = audioManager.createPlayer();
      player.setVolume(config.defaultVolume);
      TrackScheduler scheduler = new TrackScheduler(player, config.maxQueue);
      GuildMusicManager manager = new GuildMusicManager(player, scheduler);
      guild.getAudioManager().setSendingHandler(manager);
      return manager;
    });
  }

  void connect(VoiceChannel channel) {
    GuildMusicManager manager = manager(channel.getGuild());
    AudioManager audio = channel.getGuild().getAudioManager();
    if (audio.getConnectedChannel() != null && audio.getConnectedChannel().getIdLong() == channel.getIdLong()) {
      return;
    }
    audio.setAutoReconnect(false);
    audio.setConnectTimeout(10_000);
    audio.setSelfDeafened(true);
    audio.setConnectionListener(new ConnectionListener() {
      @Override
      public void onPing(long ping) {
        System.out.printf("[voice] ping=%dms guild=%s%n", ping, channel.getGuild().getId());
      }

      @Override
      public void onStatusChange(ConnectionStatus status) {
        System.out.printf("[voice] status=%s guild=%s channel=%s%n", status, channel.getGuild().getId(), channel.getId());
        if (status.name().startsWith("ERROR_")) {
          manager.scheduler.stop();
          new Thread(() -> {
            try {
              Thread.sleep(250);
            } catch (InterruptedException interrupted) {
              Thread.currentThread().interrupt();
            }
            AudioManager currentAudio = channel.getGuild().getAudioManager();
            if (currentAudio.isConnected() || currentAudio.isAttemptingToConnect()) {
              System.out.printf("[voice] closing after %s guild=%s channel=%s%n", status, channel.getGuild().getId(), channel.getId());
              currentAudio.closeAudioConnection();
            }
          }, "bdodj-voice-error-close").start();
        }
      }

      @Override
      public void onUserSpeaking(User user, boolean speaking) {
        // We only send audio, so speaking state is not useful for normal logs.
      }
    });
    System.out.printf("[voice] opening guild=%s channel=%s name=%s%n", channel.getGuild().getId(), channel.getId(), channel.getName());
    audio.setSendingHandler(manager);
    audio.openAudioConnection(channel);
  }

  void leave(Guild guild) {
    manager(guild).scheduler.stop();
    System.out.printf("[voice] closing guild=%s%n", guild.getId());
    guild.getAudioManager().closeAudioConnection();
  }

  void loadAndQueue(VoiceChannel channel, String query, Consumer<String> reply) {
    Guild guild = channel.getGuild();
    String identifier = normalizeQuery(query);
    audioManager.loadItemOrdered(guild, identifier, new AudioLoadResultHandler() {
      @Override
      public void trackLoaded(AudioTrack track) {
        connect(channel);
        int position = manager(guild).scheduler.queue(track);
        if (position < 0) {
          reply.accept("Queue is full.");
        } else if (position == 0) {
          reply.accept("Playing: **" + safe(track.getInfo().title) + "**");
        } else {
          reply.accept("Queued #" + position + ": **" + safe(track.getInfo().title) + "**");
        }
      }

      @Override
      public void playlistLoaded(AudioPlaylist playlist) {
        AudioTrack selected = playlist.getSelectedTrack();
        AudioTrack track = selected != null ? selected : playlist.getTracks().isEmpty() ? null : playlist.getTracks().get(0);
        if (track == null) {
          reply.accept("Playlist is empty.");
          return;
        }
        trackLoaded(track);
      }

      @Override
      public void noMatches() {
        reply.accept("Nothing found for: `" + safe(query) + "`");
      }

      @Override
      public void loadFailed(FriendlyException exception) {
        reply.accept("Could not load track: " + safe(exception.getMessage()));
      }
    });
  }

  private static String normalizeQuery(String query) {
    String trimmed = query == null ? "" : query.trim();
    if (trimmed.matches("(?i)^https?://.*")) return trimmed;
    return "ytsearch:" + trimmed;
  }

  static String safe(String value) {
    if (value == null) return "";
    return value.replace("@", "@\u200B").replace("`", "'");
  }
}
