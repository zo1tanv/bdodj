package ru.bdoint.bdodj;

import com.sedmelluq.discord.lavaplayer.track.AudioTrack;
import java.util.List;
import net.dv8tion.jda.api.EmbedBuilder;
import net.dv8tion.jda.api.entities.MessageEmbed;
import net.dv8tion.jda.api.interactions.components.ActionRow;
import net.dv8tion.jda.api.interactions.components.Button;

final class MusicPanel {
  private static final String ID = "bdodj:";

  static MessageEmbed embed(GuildMusicManager manager) {
    AudioTrack current = manager.scheduler.current();
    List<AudioTrack> queue = manager.scheduler.queuedTracks();

    EmbedBuilder embed = new EmbedBuilder()
      .setTitle("BDODJ Music Panel")
      .setColor(0x2F80ED);

    if (current == null) {
      embed.setDescription("Nothing is playing. Use `!play <song or url>` while in a voice channel.");
    } else {
      embed.setDescription("Now playing: **" + MusicService.safe(current.getInfo().title) + "**");
      embed.addField("Source", MusicService.safe(current.getInfo().author), true);
      embed.addField("State", manager.scheduler.isPaused() ? "Paused" : "Playing", true);
    }

    embed.addField("Queue", queue.isEmpty() ? "Empty" : queuePreview(queue), false);
    return embed.build();
  }

  static ActionRow controls(GuildMusicManager manager) {
    String pauseLabel = manager.scheduler.isPaused() ? "Resume" : "Pause";
    return ActionRow.of(
      Button.primary(ID + "pause", pauseLabel),
      Button.secondary(ID + "skip", "Skip"),
      Button.danger(ID + "stop", "Stop"),
      Button.secondary(ID + "queue", "Queue"),
      Button.secondary(ID + "refresh", "Refresh")
    );
  }

  static boolean isButton(String componentId) {
    return componentId != null && componentId.startsWith(ID);
  }

  static String action(String componentId) {
    return componentId.substring(ID.length());
  }

  private static String queuePreview(List<AudioTrack> queue) {
    StringBuilder out = new StringBuilder();
    int limit = Math.min(5, queue.size());
    for (int i = 0; i < limit; i++) {
      out.append(i + 1).append(". ").append(MusicService.safe(queue.get(i).getInfo().title)).append('\n');
    }
    if (queue.size() > limit) out.append("... and ").append(queue.size() - limit).append(" more");
    return out.toString();
  }
}
