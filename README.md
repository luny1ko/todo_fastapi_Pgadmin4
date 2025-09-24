# Todo FastAPI (frontend + backend)

Запуск:
1. Создай виртуальное окружение и установи зависимости:
   python -m venv .venv
   source .venv/bin/activate   (или .venv\Scripts\activate на Windows)
   pip install -r requirements.txt

2. Запуск приложения:
   uvicorn app.api:app --reload --host 127.0.0.1 --port 8000

3. Открой http://127.0.0.1:8000 в браузере.

Файлы:
- app/models.py — JSON-хранилище, операции CRUD для категорий и задач.
- app/api.py — FastAPI приложение и API endpoints.
- templates/index.html — фронтенд приложение (single-page).
- static/css/style.css — базовые стили.
- static/js/app.js — логика загрузки/рендера/создания.

Дальнейшие улучшения:
- Добавить редактирование/удаление категорий и задач на фронтенде.
- Подключить авторизацию (JWT/сессии).
- Перенести JSON → SQLite для многопользовательского режима.
- Улучшенный календарь (переходы между месяцами).
