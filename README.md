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
BDODJ_PREFIX=!
BDODJ_ACTIVITY=BDO Radio
BDODJ_DEFAULT_VOLUME=60
BDODJ_MAX_QUEUE=100
BDODJ_VOICE_CONNECT_TIMEOUT_MS=30000
```

`DISCORD_TOKEN` can be used instead of `BDODJ_TOKEN`.

Enable Message Content Intent in the Discord Developer Portal:
`Applications` -> BDODJ -> `Bot` -> `Privileged Gateway Intents`.

## Main UX

Run `!panel` once in the music text channel. BDODJ stores this message as the server music panel and keeps editing it after playback changes.

Buttons:
- Add: opens a modal for a YouTube link or search text.
- Queue: shows the queue privately.
- Pause, Skip, Stop: playback controls.
- Shuffle, Refresh, Leave: queue and voice controls.

The panel also shows the current track progress as elapsed time, total time, and a moving progress bar. While a track is playing, BDODJ refreshes the panel automatically.

Use `!panel reset` to create a new saved panel.

## Commands

```text
!play <url or search text>
!panel
!panel reset
!join
!pause
!skip
!stop
!leave
!queue
!now
!help
```

## Local Run

```bash
npm install
npm start
```
