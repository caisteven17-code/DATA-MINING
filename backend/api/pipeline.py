"""
pipeline.py
===========
Main orchestrator for the Byteme self-learning MBA pipeline.

Flow per upload:
  CSV Upload
    → Preprocessing (clean + basket build)
    → FP-Growth Mining (auto-tuned thresholds)
    → Rule Scoring (weighted composite score)
    → Drift Detection (vs. previous iteration)
    → Recommendation Generation (5 surfaces)
    → Storage (SQLite, versioned)
    → Return full result JSON
"""

import logging
import json
from typing import Dict, Optional, Tuple
from datetime import datetime
from pathlib import Path

from backend.core.preprocessor  import parse_csv_to_rows, build_baskets
from backend.core.mining_engine import auto_tune
from backend.core.scoring_engine import score_rules, compute_drift
from backend.core.recommender import (
    build_homepage_rankings,
    build_bundle_cards,
    build_fbt,
    build_cart_crosssell,
    build_promos,
    build_business_insights,
)
from backend.db.database import (
    init_db,
    save_iteration,
    get_latest_rules,
    get_all_iterations,
    get_latest_recommendations,
    get_iteration_rules,
    get_iteration_recommendations,
    get_price_map,
)

logger = logging.getLogger("byteme.pipeline")


def run_pipeline(csv_text: str, file_name: str) -> Tuple[bool, str, Optional[Dict]]:
    """
    Execute the full Byteme MBA pipeline for a new CSV upload.
    Accumulates data from all previously uploaded CSVs.
    
    Args:
        csv_text:  Raw CSV file contents as string
        file_name: Original filename (for display and logging)
    
    Returns:
        (success, message, result_dict)
    """
    logger.info(f"Pipeline started: {file_name}")

    # ── Step 1: Load & Combine All CSVs ──────────────────────────────────────
    uploads_dir = Path("uploads")
    uploads_dir.mkdir(exist_ok=True)
    
    all_rows = []
    
    # Load all existing CSV files
    for csv_file in uploads_dir.glob("*.csv"):
        try:
            content = csv_file.read_text(encoding="utf-8")
            ok, msg, rows = parse_csv_to_rows(content)
            if ok:
                all_rows.extend(rows)
                logger.info(f"Loaded {len(rows)} rows from {csv_file.name}")
            else:
                logger.warning(f"Failed to parse {csv_file.name}: {msg}")
        except Exception as e:
            logger.warning(f"Error loading {csv_file.name}: {e}")
    
    if not all_rows:
        return False, "No valid transactions found in uploaded CSV files.", None

    logger.info(f"Total combined rows: {len(all_rows)}")

    # ── Step 2: Preprocess → Baskets ──────────────────────────────────────────
    prep = build_baskets(all_rows)
    baskets   = prep["baskets"]
    price_map = prep["price_map"]
    item_freq = prep["item_freq"]
    prep_meta = prep["meta"]

    if not baskets:
        return False, "No valid baskets found in uploaded CSV.", None

    logger.info(f"Baskets: {len(baskets)}, Unique items: {len(price_map)}")

    # ── Step 3: Mine (FP-Growth + Auto-Tune) ─────────────────────────────────
    # Pull previous rules before mining so threshold tuning can include stability.
    prev_rules = get_latest_rules()  # empty list on first iteration
    mining_result = auto_tune(baskets, prev_rules=prev_rules)
    itemsets  = mining_result["itemsets"]
    raw_rules = mining_result["rules"]

    logger.info(f"Mined {len(itemsets)} itemsets, {len(raw_rules)} raw rules "
                f"(sup={mining_result['min_support']}, conf={mining_result['min_confidence']})")

    # ── Step 4: Score Rules ───────────────────────────────────────────────────
    scored_rules = score_rules(raw_rules)
    logger.info(f"Scored {len(scored_rules)} rules")

    # ── Step 5: Drift Detection (Self-Learning) ───────────────────────────────
    drift = compute_drift(prev_rules, scored_rules) if prev_rules else None
    if drift:
        logger.info(f"Drift computed: stability={drift['summary']['stability_score']}%")

    # ── Step 6: Recommendations ───────────────────────────────────────────────
    homepage  = build_homepage_rankings(itemsets, scored_rules, price_map, item_freq)
    bundles   = build_bundle_cards(itemsets, scored_rules, price_map)
    fbt       = build_fbt(scored_rules, price_map)
    crosssell = build_cart_crosssell(scored_rules, price_map)
    promos    = build_promos(bundles, itemsets, price_map)
    insights  = build_business_insights(
        homepage["most_bought"], homepage["least_bought"],
        bundles, scored_rules, price_map
    )

    recs = {
        "homepage":  homepage,
        "bundles":   bundles,
        "fbt":       fbt,
        "crosssell": crosssell,
        "promos":    promos,
        "insights":  insights,
    }

    # ── Step 7: Store ─────────────────────────────────────────────────────────
    iteration_id = save_iteration(
        file_name=file_name,
        prep_meta=prep_meta,
        mining_result=mining_result,
        scored_rules=scored_rules,
        itemsets=itemsets,
        recs=recs,
        drift=drift,
        price_map=price_map,
    )

    # ── Build Return Payload ──────────────────────────────────────────────────
    avg_lift = round(
        sum(r["lift"] for r in scored_rules) / len(scored_rules), 3
    ) if scored_rules else 0

    result = {
        "iteration_id": iteration_id,
        "meta": {
            **prep_meta,
            "min_support":    mining_result["min_support"],
            "min_confidence": mining_result["min_confidence"],
            "rules_count":    len(scored_rules),
            "avg_lift":       avg_lift,
        },
        "rules":     scored_rules,
        "price_map": price_map,
        "item_freq": item_freq,
        "recommendations": recs,
        "drift":     drift,
    }

    logger.info(f"Pipeline complete: iteration_id={iteration_id}")
    return True, f"Analysis complete. {len(scored_rules)} rules generated from {len(all_rows)} total transactions.", result


def get_dashboard_data() -> Optional[Dict]:
    """
    Retrieve the latest iteration's full output for dashboard display.
    Returns None if no iterations exist.
    """
    from backend.db.database import get_latest_iteration, get_latest_rules, get_latest_recommendations, get_price_map, get_iteration_itemsets
    latest = get_latest_iteration()
    if not latest:
        return None

    iter_id   = latest["id"]
    rules     = get_latest_rules()
    recs      = get_latest_recommendations()
    price_map = get_price_map(iter_id)
    itemsets  = get_iteration_itemsets(iter_id)

    return {
        "iteration":  latest,
        "rules":      rules,
        "price_map":  price_map,
        "recommendations": recs,
    }


def get_history() -> Dict:
    """Return all iterations for the iteration history view."""
    iterations = get_all_iterations()
    return {"iterations": iterations, "total": len(iterations)}
