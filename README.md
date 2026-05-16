# BDODJ

Separate Java Discord music bot for the BDO server. It runs independently from the main BDO bot and provides a button panel for playback control.

## Commands

```text
!play <url or search text>  - add a track
!panel                      - show the button panel
!pause                      - pause
!resume                     - resume
!skip                       - skip current track
!stop                       - clear queue
!leave                      - leave the voice channel
!queue                      - show queue
!now                        - show current track
!help                       - show help
```

## Environment

```env
BDODJ_TOKEN=
BDODJ_PREFIX=!
BDODJ_ACTIVITY=BDO Radio
BDODJ_STATUS=ONLINE
BDODJ_MAX_QUEUE=100
BDODJ_DEFAULT_VOLUME=60
```

`DISCORD_TOKEN` can be used instead of `BDODJ_TOKEN`.

For prefix commands, enable Message Content Intent in the Discord Developer Portal for the BDODJ application.

## Local Run

```bash
mvn package
java -jar target/bdodj-0.1.0.jar
```

## Docker

```bash
docker build -t bdodj .
docker run --env-file .env bdodj
```

Bothost can run this project only if the plan supports Docker or a custom Java container. If the Discord bot preset only offers Python, Node.js, and Go, use a separate Docker/VPS host for BDODJ or port BDODJ to Node.js.
