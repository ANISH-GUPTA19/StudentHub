import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import ValidationError

from app.api.marketplace import marketplace_router
from app.api.notifications_admin import notifications_admin_router
from app.api.payments import payments_router
from app.api.rooms import rooms_router
from app.api.routes import router
from app.core.config import load_config
from app.core.database import SessionLocal, engine
from app.services.seed import ensure_seed_data


@asynccontextmanager
async def lifespan(_app: FastAPI):
    with engine.connect() as connection:
        connection.exec_driver_sql("SELECT 1")
    with SessionLocal() as db:
        ensure_seed_data(db)
    yield


config = load_config()
os.makedirs("uploads", exist_ok=True)

app = FastAPI(title="StudentHub API", version="1.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=config.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(router)
app.include_router(marketplace_router)
app.include_router(rooms_router)
app.include_router(payments_router)
app.include_router(notifications_admin_router)
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")


@app.exception_handler(RequestValidationError)
async def request_validation_handler(_request: Request, exc: RequestValidationError) -> JSONResponse:
    return JSONResponse(
        status_code=422,
        content={"error": {"code": "VALIDATION_ERROR", "message": "Request validation failed", "details": {"errors": exc.errors()}}},
    )


@app.exception_handler(ValidationError)
async def validation_handler(_request: Request, exc: ValidationError) -> JSONResponse:
    return JSONResponse(
        status_code=422,
        content={"error": {"code": "VALIDATION_ERROR", "message": "Request validation failed", "details": {"errors": exc.errors()}}},
    )


@app.exception_handler(HTTPException)
async def http_handler(_request: Request, exc: HTTPException) -> JSONResponse:
    code = (
        "UNAUTHORIZED"
        if exc.status_code == 401
        else "FORBIDDEN"
        if exc.status_code == 403
        else "NOT_FOUND"
        if exc.status_code == 404
        else "CONFLICT"
        if exc.status_code == 409
        else "BAD_REQUEST"
    )
    return JSONResponse(status_code=exc.status_code, content={"error": {"code": code, "message": str(exc.detail)}})


@app.exception_handler(Exception)
async def internal_handler(_request: Request, _exc: Exception) -> JSONResponse:
    return JSONResponse(status_code=500, content={"error": {"code": "INTERNAL_ERROR", "message": "An unexpected error occurred"}})
