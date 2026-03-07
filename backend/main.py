"""
main.py — Byteme FastAPI backend
Compatible with FastAPI 0.110+, Pydantic v2, Python 3.13
Run: python3 -m uvicorn backend.main:app --reload --port 8000
"""

import logging
from contextlib import asynccontextmanager
from typing import Optional
from pathlib import Path
from datetime import datetime

from fastapi import FastAPI, UploadFile, File, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from backend.db.database import init_db
from backend.api.pipeline import run_pipeline, get_dashboard_data, get_history
from backend.core.preprocessor import parse_csv_to_rows
from backend.db.database import (
    get_iteration_rules,
    get_iteration_recommendations,
    get_price_map,
    get_iteration_itemsets,
    get_latest_rules,
    get_latest_recommendations,
    clear_all_data,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s — %(message)s")
logger = logging.getLogger("byteme.main")


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    logger.info("Byteme API started. Database initialized.")
    yield


app = FastAPI(
    title="Byteme MBA API",
    description="Self-learning Market Basket Analysis for Byteme fast food",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
async def health():
    return {"status": "ok", "service": "Byteme MBA API", "version": "1.0.0"}


@app.post("/api/upload")
async def upload_csv(file: UploadFile = File(...)):
    if not file.filename.endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only .csv files are accepted.")
    content = await file.read()
    try:
        csv_text = content.decode("utf-8")
    except UnicodeDecodeError:
        csv_text = content.decode("latin-1")

    ok, msg, _ = parse_csv_to_rows(csv_text)
    if not ok:
        raise HTTPException(status_code=422, detail=msg)

    logger.info(f"Upload received: {file.filename} ({len(content)} bytes)")
    Path("uploads").mkdir(exist_ok=True)
    original_name = Path(file.filename).name
    timestamp = datetime.utcnow().strftime("%Y%m%dT%H%M%S%f")
    stored_name = f"{timestamp}_{original_name}"
    (Path("uploads") / stored_name).write_text(csv_text, encoding="utf-8")

    success, message, result = run_pipeline(csv_text, file_name=original_name)
    if not success:
        raise HTTPException(status_code=422, detail=message)
    return JSONResponse(content={"success": True, "message": message, "data": result})


@app.post("/api/reset")
async def reset_all():
    uploads_dir = Path("uploads")
    deleted_files = 0

    if uploads_dir.exists():
        for csv_file in uploads_dir.glob("*.csv"):
            try:
                csv_file.unlink()
                deleted_files += 1
            except Exception as e:
                logger.warning(f"Failed to delete upload file {csv_file}: {e}")

    deleted_rows = clear_all_data()
    return {
        "success": True,
        "message": "All uploaded files and analysis history have been cleared.",
        "deleted_upload_files": deleted_files,
        "deleted_db_rows": deleted_rows,
    }


@app.get("/api/dashboard")
async def dashboard():
    data = get_dashboard_data()
    if not data:
        return JSONResponse(content={"has_data": False})
    return JSONResponse(content={"has_data": True, "data": data})


@app.get("/api/iterations")
async def list_iterations():
    return get_history()


@app.get("/api/iterations/{iteration_id}")
async def get_iteration(iteration_id: int):
    rules    = get_iteration_rules(iteration_id)
    recs     = get_iteration_recommendations(iteration_id)
    prices   = get_price_map(iteration_id)
    itemsets = get_iteration_itemsets(iteration_id)
    if not rules and not recs:
        raise HTTPException(status_code=404, detail=f"Iteration {iteration_id} not found.")
    return {"iteration_id": iteration_id, "rules": rules, "price_map": prices,
            "recommendations": recs, "itemsets": itemsets}


@app.get("/api/recommendations/homepage")
async def homepage_rankings():
    recs = get_latest_recommendations("homepage")
    return recs.get("homepage", {})


@app.get("/api/recommendations/bundles")
async def bundles():
    recs = get_latest_recommendations("bundles")
    return recs.get("bundles", [])


@app.get("/api/recommendations/fbt")
async def fbt(item: Optional[str] = Query(None)):
    recs = get_latest_recommendations("fbt")
    fbt_data = recs.get("fbt", {})
    return fbt_data.get(item, []) if item else fbt_data


@app.get("/api/recommendations/crosssell")
async def crosssell(item: Optional[str] = Query(None)):
    recs = get_latest_recommendations("crosssell")
    cs_data = recs.get("crosssell", {})
    return cs_data.get(item, []) if item else cs_data


@app.get("/api/recommendations/promos")
async def promos():
    recs = get_latest_recommendations("promos")
    return recs.get("promos", [])


@app.get("/api/recommendations/insights")
async def insights():
    recs = get_latest_recommendations("insights")
    return recs.get("insights", [])


@app.get("/api/rules")
async def list_rules(limit: int = Query(50, ge=1, le=500)):
    rules = get_latest_rules()
    return {"rules": rules[:limit], "total": len(rules)}


frontend_dist = Path("frontend/dist")
if frontend_dist.exists():
    app.mount("/", StaticFiles(directory=str(frontend_dist), html=True), name="static")
