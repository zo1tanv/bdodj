package ru.bdoint.bdodj;

import com.sedmelluq.discord.lavaplayer.container.MediaContainerRegistry;
import com.sedmelluq.discord.lavaplayer.player.AudioPlayerManager;
import com.sedmelluq.discord.lavaplayer.player.DefaultAudioPlayerManager;
import com.sedmelluq.discord.lavaplayer.source.AudioSourceManagers;
import com.sedmelluq.discord.lavaplayer.source.bandcamp.BandcampAudioSourceManager;
import com.sedmelluq.discord.lavaplayer.source.http.HttpAudioSourceManager;
import com.sedmelluq.discord.lavaplayer.source.soundcloud.SoundCloudAudioSourceManager;
import com.sedmelluq.discord.lavaplayer.source.twitch.TwitchStreamAudioSourceManager;
import com.sedmelluq.discord.lavaplayer.source.vimeo.VimeoAudioSourceManager;
import dev.lavalink.youtube.YoutubeAudioSourceManager;
import net.dv8tion.jda.api.JDA;
import net.dv8tion.jda.api.JDABuilder;
import net.dv8tion.jda.api.entities.Activity;
import net.dv8tion.jda.api.requests.GatewayIntent;

public final class BdodjBot {
  public static void main(String[] args) throws Exception {
    BotConfig config = BotConfig.fromEnv();
    if (!config.hasToken()) {
      System.err.println("BDODJ_TOKEN or DISCORD_TOKEN is required.");
      System.exit(2);
    }

    AudioPlayerManager audioManager = createAudioManager();
    MusicService musicService = new MusicService(audioManager, config);

    JDA jda = JDABuilder.createDefault(
        config.token,
        GatewayIntent.GUILD_MESSAGES,
        GatewayIntent.GUILD_VOICE_STATES
      )
      .setActivity(Activity.listening(config.activity))
      .setStatus(config.status)
      .addEventListeners(new CommandListener(config, musicService))
      .build();

    jda.awaitReady();
    System.out.printf("BDODJ ready as %s, prefix '%s'%n", jda.getSelfUser().getAsTag(), config.prefix);
  }

  private static AudioPlayerManager createAudioManager() {
    DefaultAudioPlayerManager manager = new DefaultAudioPlayerManager();

    YoutubeAudioSourceManager youtube = new YoutubeAudioSourceManager(true);
    youtube.setPlaylistPageCount(10);
    manager.registerSourceManager(youtube);
    manager.registerSourceManager(SoundCloudAudioSourceManager.createDefault());
    manager.registerSourceManager(new BandcampAudioSourceManager());
    manager.registerSourceManager(new VimeoAudioSourceManager());
    manager.registerSourceManager(new TwitchStreamAudioSourceManager());
    manager.registerSourceManager(new HttpAudioSourceManager(MediaContainerRegistry.DEFAULT_REGISTRY));
    AudioSourceManagers.registerLocalSource(manager);

    manager.getConfiguration().setFilterHotSwapEnabled(true);
    return manager;
  }
}
