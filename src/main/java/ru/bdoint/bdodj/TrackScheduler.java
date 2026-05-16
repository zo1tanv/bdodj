package ru.bdoint.bdodj;

import com.sedmelluq.discord.lavaplayer.player.AudioPlayer;
import com.sedmelluq.discord.lavaplayer.player.event.AudioEventAdapter;
import com.sedmelluq.discord.lavaplayer.track.AudioTrack;
import com.sedmelluq.discord.lavaplayer.track.AudioTrackEndReason;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.List;
import java.util.Queue;

final class TrackScheduler extends AudioEventAdapter {
  private final AudioPlayer player;
  private final int maxQueue;
  private final Queue<AudioTrack> queue = new ArrayDeque<>();

  TrackScheduler(AudioPlayer player, int maxQueue) {
    this.player = player;
    this.maxQueue = maxQueue;
  }

  synchronized int queue(AudioTrack track) {
    if (player.startTrack(track, true)) return 0;
    if (queue.size() >= maxQueue) return -1;
    queue.offer(track);
    return queue.size();
  }

  synchronized AudioTrack current() {
    return player.getPlayingTrack();
  }

  synchronized List<AudioTrack> queuedTracks() {
    return new ArrayList<>(queue);
  }

  synchronized void nextTrack() {
    player.startTrack(queue.poll(), false);
  }

  synchronized void stop() {
    queue.clear();
    player.stopTrack();
  }

  synchronized boolean pauseToggle() {
    player.setPaused(!player.isPaused());
    return player.isPaused();
  }

  boolean isPaused() {
    return player.isPaused();
  }

  @Override
  public void onTrackEnd(AudioPlayer player, AudioTrack track, AudioTrackEndReason endReason) {
    if (endReason.mayStartNext) nextTrack();
  }
}
