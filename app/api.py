# app/api.py
from fastapi import FastAPI, Request, HTTPException, Form
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pathlib import Path
from typing import Optional
from .models import store

BASE_DIR = Path(__file__).resolve().parent

app = FastAPI()

# mount static folder (maps to /static/...)
app.mount("/static", StaticFiles(directory=str(BASE_DIR / "static")), name="static")
templates = Jinja2Templates(directory=str(BASE_DIR / "templates"))

@app.get("/")
def index(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})

# ---- Categories ----
@app.get("/api/categories")
def get_categories():
    return JSONResponse(store.list_categories())

@app.post("/api/categories")
async def post_category(name: str = Form(...), color: str = Form(...)):
    if not name:
        raise HTTPException(400, "Name required")
    c = store.create_category(name=name, color=color)
    return JSONResponse(c)

@app.put("/api/categories/{cat_id}")
async def put_category(cat_id: str, name: Optional[str] = Form(None), color: Optional[str] = Form(None)):
    updated = store.update_category(cat_id, name=name, color=color)
    if not updated:
        raise HTTPException(404, "Category not found")
    return JSONResponse(updated)

@app.delete("/api/categories/{cat_id}")
def delete_category(cat_id: str):
    store.delete_category(cat_id)
    return JSONResponse({"ok": True})

# ---- Tasks ----
@app.get("/api/tasks")
def get_tasks():
    return JSONResponse(store.list_tasks())

@app.post("/api/tasks")
async def post_task(
    title: str = Form(...),
    description: str = Form(""),
    project: str = Form(""),
    priority: str = Form("Low"),
    owner: str = Form(""),
    category_id: Optional[str] = Form(None),
    date: Optional[str] = Form(None)
):
    if not title:
        raise HTTPException(400, "Title required")
    t = store.create_task(title=title, description=description, project=project,
                          priority=priority, owner=owner, category_id=category_id, date=date)
    return JSONResponse(t)

@app.put("/api/tasks/{task_id}")
async def put_task(
    task_id: str,
    title: Optional[str] = Form(None),
    description: Optional[str] = Form(None),
    project: Optional[str] = Form(None),
    priority: Optional[str] = Form(None),
    owner: Optional[str] = Form(None),
    category_id: Optional[str] = Form(None),
    date: Optional[str] = Form(None)
):
    updated = store.update_task(task_id, title=title, description=description, project=project,
                                priority=priority, owner=owner, category_id=category_id, date=date)
    if not updated:
        raise HTTPException(404, "Task not found")
    return JSONResponse(updated)

@app.delete("/api/tasks/{task_id}")
def delete_task(task_id: str):
    store.delete_task(task_id)
    return JSONResponse({"ok": True})
