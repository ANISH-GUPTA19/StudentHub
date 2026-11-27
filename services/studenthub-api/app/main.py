from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import ValidationError

from app.api.routes import router
from app.core.database import Base, SessionLocal, engine
from app.models.entities import Hostel

app = FastAPI(title="StudentHub API", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])
app.include_router(router)
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")


@app.on_event("startup")
def startup() -> None:
    with engine.connect() as connection:
        connection.exec_driver_sql("SELECT 1")
    with SessionLocal() as db:
        if db.query(Hostel).count() == 0:
            db.add_all([
                Hostel(name="The Scholar House", area="North Campus", rent=8500, rating=4.8, verified=True, amenities="Wi-Fi|Meals|Study room", image_url="https://images.unsplash.com/photo-1566073771259-6a8506099945?w=900"),
                Hostel(name="Lakeview Residency", area="University Lake", rent=7200, rating=4.6, verified=True, amenities="Wi-Fi|Laundry|Parking", image_url="https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=900"),
                Hostel(name="Apex Student Homes", area="Metro Gate", rent=9100, rating=4.7, verified=True, amenities="Meals|Gym|Study room", image_url="https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?w=900"),
            ])
            db.commit()


@app.exception_handler(ValidationError)
async def validation_handler(_request: Request, exc: ValidationError) -> JSONResponse:
    return JSONResponse(status_code=422, content={"error": {"code": "VALIDATION_ERROR", "message": "Request validation failed", "details": exc.errors()}})


@app.exception_handler(HTTPException)
async def http_handler(_request: Request, exc: HTTPException) -> JSONResponse:
    code = "UNAUTHORIZED" if exc.status_code == 401 else "NOT_FOUND" if exc.status_code == 404 else "CONFLICT" if exc.status_code == 409 else "BAD_REQUEST"
    return JSONResponse(status_code=exc.status_code, content={"error": {"code": code, "message": str(exc.detail)}})


@app.exception_handler(Exception)
async def internal_handler(_request: Request, _exc: Exception) -> JSONResponse:
    return JSONResponse(status_code=500, content={"error": {"code": "INTERNAL_ERROR", "message": "An unexpected error occurred"}})
