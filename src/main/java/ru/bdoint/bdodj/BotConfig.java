package ru.bdoint.bdodj;

import net.dv8tion.jda.api.OnlineStatus;

final class BotConfig {
  final String token;
  final String prefix;
  final String activity;
  final OnlineStatus status;
  final int maxQueue;
  final int defaultVolume;

  private BotConfig(String token, String prefix, String activity, OnlineStatus status, int maxQueue, int defaultVolume) {
    this.token = token;
    this.prefix = prefix;
    this.activity = activity;
    this.status = status;
    this.maxQueue = maxQueue;
    this.defaultVolume = defaultVolume;
  }

  static BotConfig fromEnv() {
    String token = firstEnv("BDODJ_TOKEN", "DISCORD_TOKEN");
    String prefix = env("BDODJ_PREFIX", "!");
    String activity = env("BDODJ_ACTIVITY", "BDO Radio");
    OnlineStatus status = parseStatus(env("BDODJ_STATUS", "ONLINE"));
    int maxQueue = parseInt(env("BDODJ_MAX_QUEUE", "100"), 100);
    int defaultVolume = Math.max(0, Math.min(150, parseInt(env("BDODJ_DEFAULT_VOLUME", "60"), 60)));
    return new BotConfig(token, prefix, activity, status, maxQueue, defaultVolume);
  }

  boolean hasToken() {
    return token != null && !token.trim().isEmpty();
  }

  private static String firstEnv(String... names) {
    for (String name : names) {
      String value = System.getenv(name);
      if (value != null && !value.trim().isEmpty()) return value.trim();
    }
    return "";
  }

  private static String env(String name, String fallback) {
    String value = System.getenv(name);
    return value == null || value.trim().isEmpty() ? fallback : value.trim();
  }

  private static int parseInt(String value, int fallback) {
    try {
      return Integer.parseInt(value.trim());
    } catch (Exception ignored) {
      return fallback;
    }
  }

  private static OnlineStatus parseStatus(String value) {
    try {
      return OnlineStatus.valueOf(value.trim().toUpperCase());
    } catch (Exception ignored) {
      return OnlineStatus.ONLINE;
    }
  }
}
