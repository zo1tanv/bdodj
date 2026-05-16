# BDODJ

Separate Node.js Discord music bot for the BDO server.

## Bothost

- Platform: Discord.
- Language: Node.js.
- Database: not required.
- Custom Dockerfile: enabled.
- Entry point: can be empty, Dockerfile runs `npm start`.

## Environment

```env
BDODJ_TOKEN=
BDODJ_ACTIVITY=BDO Radio
BDODJ_DEFAULT_VOLUME=60
BDODJ_MAX_QUEUE=100
BDODJ_VOICE_CONNECT_TIMEOUT_MS=30000
```

`DISCORD_TOKEN` can be used instead of `BDODJ_TOKEN`.

Message Content Intent is not required because BDODJ uses slash commands and buttons.

## Main UX

Run `/panel` once in the existing music text channel. BDODJ stores this message as the server music panel and keeps editing it after playback changes.

Buttons:
- Add: opens a modal for a YouTube link or search text.
- Queue: shows the queue privately.
- Recommendations: opens categories and curated track picks.
- Playlists: opens server/personal playlists and save-current controls.
- Pause, Skip, Stop: playback controls.
- Shuffle, Refresh, Leave: queue and voice controls.
- Volume: select `1/10` through `10/10` from the panel.

The panel also shows the current track progress as elapsed time, total time, and a moving progress bar. While a track is playing, BDODJ refreshes the panel automatically.

Use `/panel reset:true` to create a new saved panel in the current channel.

## Slash Commands

```text
/panel
/play <url or search text>
/join
/pause
/skip
/stop
/leave
/queue
/now
/playlist list
/playlist create
/playlist add-current
/playlist add-query
/playlist play
/playlist delete
```

Recommendations are stored in `data/recommendations.json`.
Runtime panel, playlist, and server settings data are stored in `data/panels.json`, `data/playlists.json`, and `data/settings.json`.

## Local Run

```bash
npm install
npm start
```
