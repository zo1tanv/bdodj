package ru.bdoint.bdodj;

import com.sedmelluq.discord.lavaplayer.player.AudioPlayer;
import com.sedmelluq.discord.lavaplayer.track.playback.AudioFrame;
import java.nio.ByteBuffer;
import net.dv8tion.jda.api.audio.AudioSendHandler;

final class GuildMusicManager implements AudioSendHandler {
  final AudioPlayer player;
  final TrackScheduler scheduler;
  private AudioFrame lastFrame;

  GuildMusicManager(AudioPlayer player, TrackScheduler scheduler) {
    this.player = player;
    this.scheduler = scheduler;
    this.player.addListener(scheduler);
  }

  @Override
  public boolean canProvide() {
    lastFrame = player.provide();
    return lastFrame != null;
  }

  @Override
  public ByteBuffer provide20MsAudio() {
    return ByteBuffer.wrap(lastFrame.getData());
  }

  @Override
  public boolean isOpus() {
    return true;
  }
}
