# BDODJ

Отдельный Node.js Discord-бот для музыки на BDO-сервере.

## Bothost

- Платформа: Discord.
- Язык разработки: Node.js.
- БД: не нужна.
- Использовать собственный Dockerfile: включить.
- Главный файл: можно оставить пустым, Dockerfile запускает `npm start`.

## Переменные окружения

```env
BDODJ_TOKEN=
BDODJ_PREFIX=!
BDODJ_ACTIVITY=BDO Radio
BDODJ_DEFAULT_VOLUME=60
BDODJ_MAX_QUEUE=100
BDODJ_VOICE_CONNECT_TIMEOUT_MS=30000
```

Можно использовать `DISCORD_TOKEN` вместо `BDODJ_TOKEN`.

Токен берется в Discord Developer Portal:
`Applications` -> твое приложение BDODJ -> `Bot` -> `Reset Token` / `Copy Token`.

Для префикс-команд включи `Message Content Intent`:
`Applications` -> BDODJ -> `Bot` -> `Privileged Gateway Intents`.

## Команды

```text
!play <url или текст для поиска>
!panel
!pause
!skip
!stop
!leave
!queue
!now
!help
```

## Локальный запуск

```bash
npm install
npm start
```
