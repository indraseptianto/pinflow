from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from database import create_db
from routers import settings, products, ai, pins
from pathlib import Path

app = FastAPI(title="PinFlow API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR = Path('/app/data/uploads')
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

app.mount('/uploads', StaticFiles(directory=str(UPLOAD_DIR)), name='uploads')

app.include_router(settings.router)
app.include_router(products.router)
app.include_router(ai.router)
app.include_router(pins.router)


@app.on_event("startup")
def on_startup():
    create_db()


@app.get("/health")
def health():
    return {"ok": True, "service": "pinflow-api"}
