package ru.bdoint.bdodj;

import com.sedmelluq.discord.lavaplayer.track.AudioTrack;
import java.util.List;
import java.util.Locale;
import net.dv8tion.jda.api.Permission;
import net.dv8tion.jda.api.entities.Guild;
import net.dv8tion.jda.api.entities.Member;
import net.dv8tion.jda.api.entities.Message;
import net.dv8tion.jda.api.entities.TextChannel;
import net.dv8tion.jda.api.entities.VoiceChannel;
import net.dv8tion.jda.api.events.interaction.ButtonClickEvent;
import net.dv8tion.jda.api.events.message.guild.GuildMessageReceivedEvent;
import net.dv8tion.jda.api.hooks.ListenerAdapter;

final class CommandListener extends ListenerAdapter {
  private final BotConfig config;
  private final MusicService music;

  CommandListener(BotConfig config, MusicService music) {
    this.config = config;
    this.music = music;
  }

  @Override
  public void onGuildMessageReceived(GuildMessageReceivedEvent event) {
    Message message = event.getMessage();
    if (event.getAuthor().isBot()) return;
    String raw = message.getContentRaw();
    if (!raw.startsWith(config.prefix)) return;

    String body = raw.substring(config.prefix.length()).trim();
    if (body.isEmpty()) return;
    String[] parts = body.split("\\s+", 2);
    String command = parts[0].toLowerCase(Locale.ROOT);
    String args = parts.length > 1 ? parts[1].trim() : "";

    switch (command) {
      case "play":
      case "p":
        handlePlay(event, args);
        break;
      case "panel":
      case "music":
        sendPanel(event.getChannel(), event.getGuild());
        break;
      case "pause":
      case "resume":
        togglePause(event.getChannel(), event.getGuild());
        break;
      case "skip":
        skip(event.getChannel(), event.getGuild());
        break;
      case "stop":
        stop(event.getChannel(), event.getGuild());
        break;
      case "leave":
      case "disconnect":
        leave(event.getChannel(), event.getGuild());
        break;
      case "queue":
      case "q":
        queue(event.getChannel(), event.getGuild());
        break;
      case "now":
      case "np":
        now(event.getChannel(), event.getGuild());
        break;
      case "help":
        help(event.getChannel());
        break;
      default:
        break;
    }
  }

  @Override
  public void onButtonClick(ButtonClickEvent event) {
    if (!MusicPanel.isButton(event.getComponentId())) return;
    if (event.getGuild() == null) {
      event.reply("This panel only works inside a server.").setEphemeral(true).queue();
      return;
    }

    Guild guild = event.getGuild();
    GuildMusicManager manager = music.manager(guild);
    String action = MusicPanel.action(event.getComponentId());

    switch (action) {
      case "pause":
        manager.scheduler.pauseToggle();
        editPanel(event, manager);
        break;
      case "skip":
        manager.scheduler.nextTrack();
        editPanel(event, manager);
        break;
      case "stop":
        manager.scheduler.stop();
        editPanel(event, manager);
        break;
      case "queue":
        event.reply(queueText(manager)).setEphemeral(true).queue();
        break;
      case "refresh":
        editPanel(event, manager);
        break;
      default:
        event.deferEdit().queue();
        break;
    }
  }

  private void handlePlay(GuildMessageReceivedEvent event, String query) {
    if (query.isEmpty()) {
      event.getChannel().sendMessage("Use `" + config.prefix + "play <song or url>`.").queue();
      return;
    }
    VoiceChannel channel = userVoiceChannel(event.getMember());
    if (channel == null) {
      event.getChannel().sendMessage("Join a voice channel first.").queue();
      return;
    }
    if (!canUse(channel, event.getGuild().getSelfMember())) {
      event.getChannel().sendMessage("I need View Channel, Connect, and Speak permissions in that voice channel.").queue();
      return;
    }

    music.connect(channel);
    event.getChannel().sendTyping().queue();
    music.loadAndQueue(event.getGuild(), query, reply -> {
      event.getChannel().sendMessage(reply).queue();
      sendPanel(event.getChannel(), event.getGuild());
    });
  }

  private void sendPanel(TextChannel channel, Guild guild) {
    GuildMusicManager manager = music.manager(guild);
    channel.sendMessageEmbeds(MusicPanel.embed(manager))
      .setActionRows(MusicPanel.controls(manager))
      .queue();
  }

  private void togglePause(TextChannel channel, Guild guild) {
    GuildMusicManager manager = music.manager(guild);
    boolean paused = manager.scheduler.pauseToggle();
    channel.sendMessage(paused ? "Paused." : "Resumed.").queue();
  }

  private void skip(TextChannel channel, Guild guild) {
    music.manager(guild).scheduler.nextTrack();
    channel.sendMessage("Skipped.").queue();
  }

  private void stop(TextChannel channel, Guild guild) {
    music.manager(guild).scheduler.stop();
    channel.sendMessage("Stopped and cleared queue.").queue();
  }

  private void leave(TextChannel channel, Guild guild) {
    music.leave(guild);
    channel.sendMessage("Disconnected.").queue();
  }

  private void queue(TextChannel channel, Guild guild) {
    channel.sendMessage(queueText(music.manager(guild))).queue();
  }

  private void now(TextChannel channel, Guild guild) {
    AudioTrack current = music.manager(guild).scheduler.current();
    channel.sendMessage(current == null ? "Nothing is playing." : "Now playing: **" + MusicService.safe(current.getInfo().title) + "**").queue();
  }

  private void help(TextChannel channel) {
    channel.sendMessage(
      "BDODJ commands:\n" +
      "`" + config.prefix + "play <song or url>` - add music\n" +
      "`" + config.prefix + "panel` - show button panel\n" +
      "`" + config.prefix + "pause`, `" + config.prefix + "skip`, `" + config.prefix + "stop`, `" + config.prefix + "leave`\n" +
      "`" + config.prefix + "queue`, `" + config.prefix + "now`"
    ).queue();
  }

  private void editPanel(ButtonClickEvent event, GuildMusicManager manager) {
    event.editMessageEmbeds(MusicPanel.embed(manager))
      .setActionRows(MusicPanel.controls(manager))
      .queue();
  }

  private static String queueText(GuildMusicManager manager) {
    AudioTrack current = manager.scheduler.current();
    List<AudioTrack> queue = manager.scheduler.queuedTracks();
    StringBuilder out = new StringBuilder();
    out.append(current == null ? "Now: nothing" : "Now: " + MusicService.safe(current.getInfo().title));
    if (queue.isEmpty()) return out.append("\nQueue is empty.").toString();
    out.append("\nQueue:\n");
    for (int i = 0; i < Math.min(10, queue.size()); i++) {
      out.append(i + 1).append(". ").append(MusicService.safe(queue.get(i).getInfo().title)).append('\n');
    }
    if (queue.size() > 10) out.append("... and ").append(queue.size() - 10).append(" more");
    return out.toString();
  }

  private static VoiceChannel userVoiceChannel(Member member) {
    if (member == null || member.getVoiceState() == null) return null;
    return member.getVoiceState().getChannel();
  }

  private static boolean canUse(VoiceChannel channel, Member self) {
    if (self == null) return false;
    return self.hasPermission(channel, Permission.VIEW_CHANNEL, Permission.VOICE_CONNECT, Permission.VOICE_SPEAK);
  }
}
