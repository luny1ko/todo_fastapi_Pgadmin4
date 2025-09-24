# app/models.py
from dataclasses import dataclass, asdict
from typing import List, Optional, Any, Dict
from pathlib import Path
from datetime import datetime, date
import threading
import uuid
import psycopg2
import psycopg2.extras
from psycopg2.pool import ThreadedConnectionPool

# --------------------------
# === Конфигурация БД ===
# --------------------------
# Здесь нужно **ввести свои параметры подключения** в одну строку DSN-like или оставить как пример.
# Формат: "host=HOST port=PORT dbname=DBNAME user=USER password=PASSWORD"
# Пример:
# CONNECTION_DSN = "host=127.0.0.1 port=5432 dbname=MyToDO user=myuser password=mypass"
#
# Поставь свои значения в эту строку перед запуском сервера.
CONNECTION_DSN = "host=localhost port=5432 dbname=MyToDO user=postgres password=1234"

# Параметры пула: минимальное/максимальное число соединений
POOL_MINCONN = 1
POOL_MAXCONN = 10

# --------------------------
# === Конвертеры/утилиты ===
# --------------------------
_lock = threading.Lock()
_pool: Optional[ThreadedConnectionPool] = None

def _ensure_pool():
    global _pool
    if _pool is None:
        with _lock:
            if _pool is None:
                try:
                    _pool = ThreadedConnectionPool(POOL_MINCONN, POOL_MAXCONN, dsn=CONNECTION_DSN)
                except Exception as e:
                    # пробрасываем исключение с понятным текстом
                    raise RuntimeError(f"Не удалось создать пул подключений к PostgreSQL: {e}")

def _get_conn():
    _ensure_pool()
    assert _pool is not None
    return _pool.getconn()

def _put_conn(conn):
    assert _pool is not None
    _pool.putconn(conn)

def _row_to_category(row: Dict[str, Any]) -> Dict[str, Any]:
    # Преобразуем строку БД в словарь, соответствующий прежнему формату
    return {
        "id": str(row["id"]),
        "name": row["name"],
        "color": row.get("color") or "#cccccc",
        "created_at": row.get("created_at").isoformat() if row.get("created_at") else None
    }

def _row_to_task(row: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": str(row["id"]),
        "title": row["title"],
        "description": row.get("description") or "",
        "project": row.get("project") or "",
        "priority": row.get("priority") or "Low",
        "owner": row.get("owner") or "",
        "category_id": str(row["category_id"]) if row.get("category_id") is not None else None,
        "date": row["date"].isoformat() if isinstance(row.get("date"), date) else (row.get("date") if row.get("date") else None),
        "created_at": row.get("created_at").isoformat() if row.get("created_at") else None
    }

# --------------------------
# === Датаклассы (интерфейс) ===
# --------------------------
@dataclass
class Category:
    id: str
    name: str
    color: str

@dataclass
class Task:
    id: str
    title: str
    description: str = ""
    project: str = ""
    priority: str = "Low"
    owner: str = ""
    category_id: Optional[str] = None
    date: Optional[str] = None

# --------------------------
# === DataStore реализованный c Postgres ===
# --------------------------
class DataStore:
    def __init__(self):
        # пул создастся при первом вызове
        _ensure_pool()

    # ---- Categories ----
    def list_categories(self) -> List[Dict[str, Any]]:
        conn = _get_conn()
        try:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                cur.execute("SELECT id, name, color, created_at FROM categories ORDER BY id;")
                rows = cur.fetchall()
                return [_row_to_category(r) for r in rows]
        finally:
            _put_conn(conn)

    def create_category(self, name: str, color: str) -> Dict[str, Any]:
        conn = _get_conn()
        try:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                cur.execute(
                    "INSERT INTO categories (name, color, created_at) VALUES (%s, %s, now()) RETURNING id, name, color, created_at;",
                    (name, color)
                )
                row = cur.fetchone()
                conn.commit()
                return _row_to_category(row)
        finally:
            _put_conn(conn)

    def update_category(self, cat_id: str, name: Optional[str] = None, color: Optional[str] = None) -> Optional[Dict[str, Any]]:
        conn = _get_conn()
        try:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                # Build dynamic SET
                sets = []
                params = []
                if name is not None:
                    sets.append("name = %s"); params.append(name)
                if color is not None:
                    sets.append("color = %s"); params.append(color)
                if not sets:
                    # ничего менять не нужно — вернем текущее значение
                    cur.execute("SELECT id, name, color, created_at FROM categories WHERE id = %s;", (cat_id,))
                    row = cur.fetchone()
                    return _row_to_category(row) if row else None
                sql = "UPDATE categories SET " + ", ".join(sets) + " WHERE id = %s RETURNING id, name, color, created_at;"
                params.append(cat_id)
                cur.execute(sql, tuple(params))
                row = cur.fetchone()
                conn.commit()
                return _row_to_category(row) if row else None
        finally:
            _put_conn(conn)

    def delete_category(self, cat_id: str) -> bool:
        conn = _get_conn()
        try:
            with conn.cursor() as cur:
                # detach tasks (set category_id = NULL), then delete category
                cur.execute("UPDATE tasks SET category_id = NULL WHERE category_id = %s;", (cat_id,))
                cur.execute("DELETE FROM categories WHERE id = %s;", (cat_id,))
                conn.commit()
                return True
        finally:
            _put_conn(conn)

    # ---- Tasks ----
    def list_tasks(self) -> List[Dict[str, Any]]:
        conn = _get_conn()
        try:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                cur.execute("""
                    SELECT id, title, description, project, priority, owner, category_id, date, created_at
                    FROM tasks
                    ORDER BY created_at DESC NULLS LAST, id;
                """)
                rows = cur.fetchall()
                return [_row_to_task(r) for r in rows]
        finally:
            _put_conn(conn)

    def create_task(self, title: str, description: str = "", project: str = "",
                    priority: str = "Low", owner: str = "", category_id: Optional[str] = None,
                    date: Optional[str] = None) -> Dict[str, Any]:
        conn = _get_conn()
        try:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                cur.execute("""
                    INSERT INTO tasks (title, description, project, priority, owner, category_id, date, created_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, now())
                    RETURNING id, title, description, project, priority, owner, category_id, date, created_at;
                """, (title, description, project, priority, owner, category_id, date))
                row = cur.fetchone()
                conn.commit()
                return _row_to_task(row)
        finally:
            _put_conn(conn)

    def update_task(self, task_id: str, **kwargs) -> Optional[Dict[str, Any]]:
        # kwargs может содержать title, description, project, priority, owner, category_id, date
        conn = _get_conn()
        try:
            with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                sets = []
                params = []
                allowed = {"title","description","project","priority","owner","category_id","date"}
                for k,v in kwargs.items():
                    if k in allowed and v is not None:
                        sets.append(f"{k} = %s")
                        params.append(v)
                if not sets:
                    # ничего менять
                    cur.execute("SELECT id, title, description, project, priority, owner, category_id, date, created_at FROM tasks WHERE id = %s;", (task_id,))
                    row = cur.fetchone()
                    return _row_to_task(row) if row else None
                sql = "UPDATE tasks SET " + ", ".join(sets) + " WHERE id = %s RETURNING id, title, description, project, priority, owner, category_id, date, created_at;"
                params.append(task_id)
                cur.execute(sql, tuple(params))
                row = cur.fetchone()
                conn.commit()
                return _row_to_task(row) if row else None
        finally:
            _put_conn(conn)

    def delete_task(self, task_id: str) -> bool:
        conn = _get_conn()
        try:
            with conn.cursor() as cur:
                cur.execute("DELETE FROM tasks WHERE id = %s;", (task_id,))
                conn.commit()
                return True
        finally:
            _put_conn(conn)

# singleton
store = DataStore()
