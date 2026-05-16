# BDODJ

Отдельный Java Discord music bot для BDO-сервера. Работает независимо от основного BDO bot и управляется кнопочной панелью.

## Команды

```text
!play <ссылка или название>  - добавить трек
!panel                       - показать кнопочную панель
!pause                       - пауза
!resume                      - продолжить
!skip                        - следующий трек
!stop                        - очистить очередь
!leave                       - выйти из голосового канала
!queue                       - показать очередь
!now                         - текущий трек
!help                        - помощь
```

## Переменные

```env
BDODJ_TOKEN=
BDODJ_PREFIX=!
BDODJ_ACTIVITY=BDO Radio
BDODJ_STATUS=ONLINE
BDODJ_MAX_QUEUE=100
BDODJ_DEFAULT_VOLUME=60
```

Можно использовать `DISCORD_TOKEN` вместо `BDODJ_TOKEN`.

## Локальный запуск

```bash
mvn package
java -jar target/bdodj-0.1.0.jar
```

## Docker

```bash
docker build -t bdodj .
docker run --env-file .env bdodj
```
