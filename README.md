# Developer Profiler

Платформа для сбора базы застройщиков из скриншотов Instagram-рекламы.

Загружаешь скрин → Groq Vision достаёт имя компании и Instagram → система ищет телефон (сайт / поиск) → строка появляется в таблице. По клику открывается карточка, куда вручную заносятся ответы со звонка: сдача, метражи, рассрочка, ипотека.

## Возможности

- Загрузка скриншота (реклама или профиль Instagram)
- Извлечение данных через **Groq Vision** (`qwen/qwen3.6-27b`)
- Поиск телефона: OCR скрина → сайт застройщика → веб-поиск
- **Upsert** по Instagram: повторный скрин обновляет запись, не создаёт дубликат
- Таблица со статусами: Новый / Не взяли / Перезвонить / Дозвонились / Отказ
- Поиск, фильтры, статистика, экспорт **CSV**
- Карточка звонка: превью скрина, телефон, статус, поля опроса, «перезвонить»
- Удаление застройщика
- Скрин сохраняется один раз — в папке застройщика

## Стек

- Node.js 20+
- Express
- Groq SDK (vision + text)
- Sharp (сжатие скринов под лимит TPM)
- Файловое хранилище JSON (`data/developers/`)

## Быстрый старт

```bash
npm install
cp .env.example .env
# впиши GROQ_API_KEY в .env
npm run dev
```

Открой [http://127.0.0.1:3000](http://127.0.0.1:3000).

Для продакшена:

```bash
npm start
```

## Переменные окружения

| Переменная | Описание | По умолчанию |
|---|---|---|
| `GROQ_API_KEY` | API-ключ Groq | обязателен |
| `GROQ_MODEL` | Vision-модель | `qwen/qwen3.6-27b` |
| `GROQ_TEXT_MODEL` | Текстовая модель для выбора телефона | `llama-3.3-70b-versatile` |
| `PORT` | Порт сервера | `3000` |
| `DATA_ROOT` | Корень данных (для Railway volume) | `./data` |

## Структура

```
src/
  server.js                 # Express API + статика
  lib/
    groq.js                 # Vision-извлечение
    enrich.js               # Поиск телефона
    storage.js              # Сохранение профилей / карточек
    callNotes.js            # Схема ответов со звонка
    image.js                # Сжатие скринов
  prompts/
    developerExtract.js     # Промпт для Groq Vision
static/                     # UI (таблица + карточка)
data/developers/            # Сохранённые застройщики
railway.toml                # Конфиг деплоя
```

## API

| Метод | Путь | Назначение |
|---|---|---|
| `POST` | `/api/extract` | Загрузить скрин и создать запись |
| `GET` | `/api/developers` | Список для таблицы |
| `GET` | `/api/developers/:id` | Полная карточка |
| `PATCH` | `/api/developers/:id/phone` | Обновить телефон |
| `PATCH` | `/api/developers/:id/status` | Сменить статус |
| `PUT` | `/api/developers/:id/call-notes` | Сохранить ответы со звонка |
| `DELETE` | `/api/developers/:id` | Удалить запись |
| `GET` | `/api/developers/:id/screenshot` | Скриншот |
| `GET` | `/api/developers/export.csv` | Экспорт CSV |
| `GET` | `/api/meta` | Справочник статусов |
| `GET` | `/health` | Healthcheck |

## Деплой на Railway

1. Залей репозиторий в GitHub и подключи к Railway.
2. Variables: `GROQ_API_KEY` (и при необходимости модели).
3. Volume:
   - mount path: `/data`
   - `DATA_ROOT=/data`
4. Start command уже в `railway.toml`: `npm start`.

Без volume данные пропадут после редеплоя.

## Важные нюансы

- На **рекламном** скрине телефона часто нет — он обычно в bio профиля Instagram.
- Instagram bio ботам почти не отдаёт; если номер не нашёлся — загрузи скрин профиля или впиши вручную.
- Лучше один скрин на застройщика: данные звонка живут в карточке, а не в JSON Vision.

## Лицензия

Private project.


Groq - a.shodmono60@gmail.com
