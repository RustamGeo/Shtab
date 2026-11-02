# Исходники Штаба

Сайт в корне репозитория (`index.html`, `sw.js`, `manifest.webmanifest`, `icons/`) **собирается** из этой папки. Править нужно здесь, а не в корневом `index.html`.

| Файл | Что это |
|---|---|
| `app.html` | Всё приложение: разметка, стили, темы оформления, логика (проекты, задачи, заметки, дерево, граф, вкладки, разделение экрана). Работает и сам по себе — данные тогда только в браузере |
| `cloud.js` | Облачный модуль: вход по почте и паролю, синхронизация с Supabase (таблица `docs`), очередь офлайн-правок, регистрация офлайн-кэша. При сборке подставляется в `app.html` вместо локального хранилища |
| `build.py` | Сборка: `app.html` + `cloud.js` → `index.html`, плюс `sw.js`, манифест, иконки, README, SQL и keepalive в корень |
| `templates/` | `README.md` (инструкция по настройке — уходит в корень), `supabase.sql` (таблица и правила базы), `keepalive.yml` (ежедневный пинг базы) |
| `tests/` | Автотесты в браузере (Playwright): вкладки и разделение экрана, облако на тестовой базе (`mock_supabase.js`), темы. `seed.json` — пример данных |

`config.js` в корне не собирается и не перезаписывается — там адрес базы и публичный ключ.

## Выпуск новой версии

1. Изменить `app.html` и/или `cloud.js`.
2. В `build.py` увеличить `APP_VER` (например `'v7'` → `'v8'`) — по нему установленные приложения покажут «Вышла новая версия → Обновить».
3. `python3 src/build.py` (нужен Python 3 и Pillow для иконок).
4. Закоммитить и отправить в `main` — GitHub Pages обновит сайт за 1–2 минуты.

## Тесты

Нужны `pip install playwright` и `playwright install chromium`. Тесты открывают страницы с `http://localhost:8765/`:

```
mkdir -p /tmp/shtab-t/site && cd /tmp/shtab-t
(printf '<!doctype html><meta charset=utf8>'; cat REPO/src/app.html) > index.html     # приложение без облака
cp REPO/src/tests/mock_supabase.js . && cp REPO/index.html REPO/config.js site/
sed -i 's#https://cdn.jsdelivr.net/npm/@supabase/supabase-js@[^"]*#../mock_supabase.js#' site/index.html
python3 -m http.server 8765 &
python3 REPO/src/tests/test_tabs.py; python3 REPO/src/tests/test_cloud.py; python3 REPO/src/tests/test_skins.py
```

(`REPO` — путь к этому репозиторию.) Скриншоты сохраняются в `/tmp/shtab-*.png`.
