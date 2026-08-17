# Деплой «Школы 911» на Railway

Проект больше не зависит от инфраструктуры Manus. Вход идёт через Telegram,
файлы лежат в S3-совместимом хранилище, всё остальное — обычное Node-приложение
`Express + Vite`, которое собирается в `dist/` и слушает `PORT`.

## Что подготовить заранее

Три вещи, каждая занимает несколько минут.

### 1. Бот в Telegram

В [@BotFather](https://t.me/BotFather):

1. `/newbot` → имя и username → получите **токен** (`TELEGRAM_BOT_TOKEN`).
2. `/setdomain` → выберите бота → отправьте домен деплоя, например
   `school911.up.railway.app`.

Третий шаг обязателен: виджет входа отказывается работать на домене, который не
привязан к боту. Домен нужно переотправлять при каждой смене адреса.

Владельца можно задать двумя способами:

- `OWNER_OPEN_ID=tg:123456789` — числовой ID, узнать у
  [@userinfobot](https://t.me/userinfobot);
- `OWNER_TELEGRAM_USERNAME=имя_без_собаки` — первый вход с этим username
  забирает права владельца и записывает числовой ID в базу.

Второй вариант удобнее на первом деплое. После того как владелец появился,
username больше ничего не даёт: handle в Telegram можно освободить и занять
заново, поэтому он работает только как ключ первичной настройки. Числовой ID
печатается в логе при каждом входе — впишите его в `OWNER_OPEN_ID`, когда
увидите.

Чтобы бот мог присылать уведомления, один раз нажмите в нём Start.

### 2. Хранилище файлов

Нужно только для загрузки картинок: схем ФИПИ и рисунков к решениям. Есть три
пути, код одинаковый — меняются только переменные.

**Локальный диск (по умолчанию).** Ничего настраивать не нужно: если блок `S3_*`
пуст, файлы пишутся в `STORAGE_DIR`. На Railway создайте Volume и укажите его
путь монтирования, иначе загруженное пропадёт при следующем передеплое. Проще
всего, но без CDN и с ручными бэкапами.

**S3-совместимый сервис.** Подходит любой, менять код не нужно:

| Сервис | `S3_ENDPOINT` | `S3_REGION` |
|---|---|---|
| Yandex Object Storage | `https://storage.yandexcloud.net` | `ru-central1` |
| Selectel | `https://s3.ru-1.storage.selcloud.ru` | `ru-1` |
| VK Cloud | `https://hb.ru-msk.vkcs.cloud` | `ru-msk` |
| Cloudflare R2 | `https://<account_id>.r2.cloudflarestorage.com` | `auto` |
| Backblaze B2 | `https://s3.<region>.backblazeb2.com` | регион бакета |

Для российской аудитории удобнее Yandex или Selectel: серверы ближе, оплата в
рублях и без зарубежной карты. Объём здесь копеечный — все схемы ФИПИ занимают
около 11 МБ.

Если раздаёте бакет через публичный домен, укажите его в `S3_PUBLIC_URL` —
тогда картинки пойдут напрямую через CDN. Если оставить пустым, сервер будет
отдавать подписанные ссылки сам: медленнее, но работает без публичного доступа.

### 3. Проект в Railway

1. New Project → Deploy from GitHub repo → выберите `exam-math-platform`.
2. Add plugin → **MySQL**.
3. В Variables сервиса задайте переменные из `.env.example`. Для базы можно
   сослаться на плагин: `DATABASE_URL=${{MySQL.MYSQL_URL}}`.
4. `JWT_SECRET` сгенерируйте: `openssl rand -hex 32`.

`railway.json` уже задаёт команды сборки и запуска и health-check на
`/api/health`, так что дополнительной настройки не требуется.

## Первый запуск

После первого успешного деплоя примените схему базы:

```bash
railway run pnpm db:push
```

Затем откройте сайт, войдите через Telegram и убедитесь, что аккаунт
определился как владелец — в меню появится раздел «Контент».

## Наполнение банка

Сборщик ФИПИ живёт отдельно и в сеть за приложением не ходит:

```bash
cd tools/fipi
python3 run.py crawl      # 39 запросов, сырые страницы в cache/
python3 run.py build      # -> out/tasks.jsonl с номерами заданий
python3 run.py groups     # общий текст и план блока 1–5
python3 run.py build      # повторно, чтобы привязать общее условие
python3 run.py images     # схемы
python3 run.py solve --choices   # ключи ответов, с подтверждением у ФИПИ
```

Затем импорт в базу — он идемпотентен, GUID задания ФИПИ служит ключом:

```bash
pnpm import:fipi -- --with-images
```

Если поменялась только классификация, полный импорт запускать незачем: он
переписывает условия и заново заливает схемы ради одной колонки. Точечный
перенос задач по корзинам делает отдельный скрипт, тем же ключом:

```bash
railway volume files --volume school-911-volume upload --overwrite \
  tools/db/apply-numbers.mjs /import/apply-numbers.mjs
railway volume files --volume school-911-volume upload --overwrite \
  tools/fipi/out/tasks.jsonl /import/out/tasks.jsonl
railway ssh -- node /data/import/apply-numbers.mjs \
  --tasks /data/import/out/tasks.jsonl --dry-run   # сначала посмотреть
railway ssh -- node /data/import/apply-numbers.mjs --tasks /data/import/out/tasks.jsonl
```

Сборщик должен работать из сети, откуда виден `oge.fipi.ru`. С Railway он
недоступен: сервера зарубежные, и соединение отваливается по таймауту.
Подробности — в [tools/fipi/README.md](tools/fipi/README.md).

## Резервная копия

База живёт в одном экземпляре на Railway, а внутри неё есть то, что нельзя
пересобрать заново: подтверждённые ключи ответов, каждый из которых стоил
запроса к ФИПИ, и разборы, написанные редакторами руками. Условия и схемы
восстанавливаются повторным прогоном сборщика, эти две вещи — нет.

```bash
railway ssh -- sh -c 'cd /app && node_modules/.bin/tsx server/exportBank.ts --out /data/backup'
railway volume files --volume school-911-volume download /backup backup --overwrite
```

Первая команда выгружает базу в JSONL на том, вторая забирает выгрузку к вам.
Второй шаг обязателен: копия на том же хостинге, что и база, защищает только
от ошибки в запросе, но не от потери проекта.

Ключи ответов дополнительно лежат в репозитории —
`tools/fipi/out/answers.jsonl`. Это не материал ФИПИ, а результат наших
вычислений, подтверждённый их проверкой; вернуть его в базу можно так:

```bash
pnpm import:fipi -- --answers tools/fipi/out/answers.jsonl
```

## Переменные окружения

| Переменная | Обязательна | Что будет без неё |
|---|---|---|
| `DATABASE_URL` | да | приложение поднимется, но все запросы к данным вернут ошибку |
| `JWT_SECRET` | да | вход упадёт с ошибкой подписи сессии |
| `TELEGRAM_BOT_TOKEN` | да | страница входа покажет, что вход не настроен |
| `TELEGRAM_BOT_USERNAME` | да | то же самое: виджету нечего рендерить |
| `OWNER_OPEN_ID` или `OWNER_TELEGRAM_USERNAME` | да | некому выдавать права администраторов |
| `STORAGE_DIR` | нет | файлы лягут в `./storage` рядом с приложением |
| `S3_*` | нет | хранилище останется на локальном диске |
| `S3_PUBLIC_URL` | нет | файлы пойдут через подписанные ссылки |
| `VITE_BANNER_IMAGE_URL` | нет | баннер отрисуется текстовым вариантом |
| `CRON_SECRET` | нет | эндпоинты `/api/scheduled/*` отвечают 403 |

## Что изменилось при переезде

| Было (Manus) | Стало |
|---|---|
| OAuth через `WebDevAuthPublicService` | Telegram Login Widget, проверка подписи HMAC-SHA256 |
| Forge presigned S3 | прямой S3 через `@aws-sdk/client-s3` |
| `/manus-storage/<key>` | `/media/<key>` |
| Уведомления через Forge | сообщения от того же Telegram-бота |
| Cron с `isCron` в сессии | заголовок `X-Cron-Secret` |
| `sameSite: "none"` для iframe | `sameSite: "lax"`, сайт первопартийный |
| `vite-plugin-manus-runtime` | удалён |

Сессии не менялись: это по-прежнему HS256 JWT в куке `app_session_id`,
подписанный `JWT_SECRET`. Поэтому переезд не затронул tRPC-контекст, роли и
роутеры.
