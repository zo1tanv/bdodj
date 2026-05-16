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
import net.dv8tion.jda.api.entities.Guild;
import net.dv8tion.jda.api.entities.VoiceChannel;

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
    channel.getGuild().getAudioManager().setSendingHandler(manager);
    channel.getGuild().getAudioManager().openAudioConnection(channel);
  }

  void leave(Guild guild) {
    manager(guild).scheduler.stop();
    guild.getAudioManager().closeAudioConnection();
  }

  void loadAndQueue(Guild guild, String query, Consumer<String> reply) {
    String identifier = normalizeQuery(query);
    audioManager.loadItemOrdered(guild, identifier, new AudioLoadResultHandler() {
      @Override
      public void trackLoaded(AudioTrack track) {
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
