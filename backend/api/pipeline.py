"""
pipeline.py
===========
Main orchestrator for the Byteme self-learning MBA pipeline.
"""

import logging
from typing import Dict, Optional, Tuple

from backend.core.preprocessor import parse_csv_to_rows, build_baskets, clean_rows_for_storage
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
    save_iteration,
    save_cleaned_rows,
    get_all_cleaned_rows,
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
    Accumulates data from all previously uploaded and cleaned rows stored in Supabase.

    Args:
        csv_text: Raw CSV file contents as string
        file_name: Original filename (for display and logging)

    Returns:
        (success, message, result_dict)
    """
    logger.info("Pipeline started: %s", file_name)

    # Step 1: parse current upload and combine with historical cleaned rows.
    ok, msg, new_rows = parse_csv_to_rows(csv_text)
    if not ok:
        return False, msg, None

    new_cleaned_rows = clean_rows_for_storage(new_rows)
    historical_rows = get_all_cleaned_rows()
    all_rows = historical_rows + new_cleaned_rows

    if not all_rows:
        return False, "No valid transactions found after cleaning.", None

    logger.info(
        "Combined rows: historical=%s, new=%s, total=%s",
        len(historical_rows),
        len(new_cleaned_rows),
        len(all_rows),
    )

    # Step 2: preprocess to baskets.
    prep = build_baskets(all_rows)
    baskets = prep["baskets"]
    price_map = prep["price_map"]
    item_freq = prep["item_freq"]
    prep_meta = prep["meta"]

    if not baskets:
        return False, "No valid baskets found in uploaded CSV.", None

    logger.info("Baskets: %s, Unique items: %s", len(baskets), len(price_map))

    # Step 3: mine with auto-tuning.
    prev_rules = get_latest_rules()
    mining_result = auto_tune(baskets, prev_rules=prev_rules)
    itemsets = mining_result["itemsets"]
    raw_rules = mining_result["rules"]

    logger.info(
        "Mined %s itemsets, %s raw rules (sup=%s, conf=%s)",
        len(itemsets),
        len(raw_rules),
        mining_result["min_support"],
        mining_result["min_confidence"],
    )

    # Step 4: score rules.
    scored_rules = score_rules(raw_rules)
    logger.info("Scored %s rules", len(scored_rules))

    # Step 5: drift detection.
    drift = compute_drift(prev_rules, scored_rules) if prev_rules else None
    if drift:
        logger.info("Drift computed: stability=%s%%", drift["summary"]["stability_score"])

    # Step 6: recommendations.
    homepage = build_homepage_rankings(itemsets, scored_rules, price_map, item_freq)
    bundles = build_bundle_cards(itemsets, scored_rules, price_map)
    fbt = build_fbt(scored_rules, price_map)
    crosssell = build_cart_crosssell(scored_rules, price_map)
    promos = build_promos(bundles, itemsets, price_map)
    insights = build_business_insights(
        homepage["most_bought"],
        homepage["least_bought"],
        bundles,
        scored_rules,
        price_map,
    )

    recs = {
        "homepage": homepage,
        "bundles": bundles,
        "fbt": fbt,
        "crosssell": crosssell,
        "promos": promos,
        "insights": insights,
    }

    # Step 7: store iteration and newly cleaned rows.
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
    save_cleaned_rows(iteration_id, new_cleaned_rows)

    # Build return payload.
    avg_lift = round(sum(r["lift"] for r in scored_rules) / len(scored_rules), 3) if scored_rules else 0

    result = {
        "iteration_id": iteration_id,
        "meta": {
            **prep_meta,
            "min_support": mining_result["min_support"],
            "min_confidence": mining_result["min_confidence"],
            "rules_count": len(scored_rules),
            "avg_lift": avg_lift,
        },
        "rules": scored_rules,
        "price_map": price_map,
        "item_freq": item_freq,
        "recommendations": recs,
        "drift": drift,
    }

    logger.info("Pipeline complete: iteration_id=%s", iteration_id)
    return True, f"Analysis complete. {len(scored_rules)} rules generated from {len(all_rows)} total transactions.", result


def get_dashboard_data() -> Optional[Dict]:
    """
    Retrieve the latest iteration's full output for dashboard display.
    Returns None if no iterations exist.
    """
    from backend.db.database import (
        get_latest_iteration,
        get_latest_rules,
        get_latest_recommendations,
        get_price_map,
        get_iteration_itemsets,
    )

    latest = get_latest_iteration()
    if not latest:
        return None

    iter_id = latest["id"]
    rules = get_latest_rules()
    recs = get_latest_recommendations()
    price_map = get_price_map(iter_id)
    itemsets = get_iteration_itemsets(iter_id)

    return {
        "iteration": latest,
        "rules": rules,
        "price_map": price_map,
        "recommendations": recs,
        "itemsets": itemsets,
    }


def get_history() -> Dict:
    """Return all iterations for the iteration history view."""
    iterations = get_all_iterations()
    return {"iterations": iterations, "total": len(iterations)}
