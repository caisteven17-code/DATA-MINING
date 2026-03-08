"""
database.py
===========
Supabase storage layer for Byteme.
"""

import json
import logging
import os
from datetime import datetime
from typing import Dict, List, Optional

from dotenv import load_dotenv
from supabase import Client, create_client

logger = logging.getLogger("byteme.database")

# Load .env from project root so uvicorn picks local env vars automatically.
load_dotenv()

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

_client: Optional[Client] = None
_TABLES = ("iterations", "rules", "itemsets", "recommendations", "drift_log", "price_map", "cleaned_rows")


def get_client() -> Client:
    global _client
    if _client is None:
        if not SUPABASE_URL or not SUPABASE_KEY:
            raise RuntimeError(
                "Missing Supabase config. Set SUPABASE_URL and SUPABASE_KEY (or SUPABASE_SERVICE_ROLE_KEY)."
            )
        _client = create_client(SUPABASE_URL, SUPABASE_KEY)
    return _client


def _parse_json_if_needed(value):
    if isinstance(value, str):
        try:
            return json.loads(value)
        except Exception:
            return value
    return value


def init_db():
    """
    Validate Supabase connectivity and required tables.
    Schema creation is managed in Supabase SQL Editor (see schema.sql).
    """
    client = get_client()
    for table in _TABLES:
        client.table(table).select("id").limit(1).execute()
    logger.info("Supabase connection initialized and required tables are reachable.")


def _get_latest_iteration_brief() -> Optional[Dict]:
    resp = get_client().table("iterations").select("id,iteration_num").order("id", desc=True).limit(1).execute()
    data = resp.data or []
    return data[0] if data else None


def _extract_inserted_id(response, table_name: str, fallback_iteration_num: int) -> int:
    data = response.data
    if isinstance(data, list) and data:
        return int(data[0]["id"])
    if isinstance(data, dict) and "id" in data:
        return int(data["id"])

    lookup = (
        get_client()
        .table(table_name)
        .select("id")
        .eq("iteration_num", fallback_iteration_num)
        .order("id", desc=True)
        .limit(1)
        .execute()
    )
    lookup_data = lookup.data or []
    if not lookup_data:
        raise RuntimeError("Failed to resolve inserted iteration id from Supabase response.")
    return int(lookup_data[0]["id"])


def save_iteration(
    file_name: str,
    prep_meta: Dict,
    mining_result: Dict,
    scored_rules: List[Dict],
    itemsets: List[Dict],
    recs: Dict,
    drift: Optional[Dict],
    price_map: Dict,
) -> int:
    """Save a complete iteration to Supabase. Returns the new iteration_id."""
    client = get_client()
    latest = _get_latest_iteration_brief()
    prev_iter_id = int(latest["id"]) if latest else None
    iteration_num = (int(latest["iteration_num"]) + 1) if latest else 1

    drift_summary = drift["summary"] if drift else None
    stability = drift["summary"]["stability_score"] if drift else None

    iter_payload = {
        "iteration_num": iteration_num,
        "file_name": file_name,
        "uploaded_at": datetime.utcnow().isoformat(),
        "total_rows": prep_meta.get("total_rows"),
        "baskets": prep_meta.get("baskets"),
        "unique_items": prep_meta.get("unique_items"),
        "avg_basket_size": prep_meta.get("avg_basket_size"),
        "date_earliest": prep_meta.get("date_range", {}).get("earliest"),
        "date_latest": prep_meta.get("date_range", {}).get("latest"),
        "min_support": mining_result.get("min_support"),
        "min_confidence": mining_result.get("min_confidence"),
        "rules_count": len(scored_rules),
        "avg_lift": (sum(r["lift"] for r in scored_rules) / len(scored_rules)) if scored_rules else 0,
        "stability_score": stability,
        "drift_summary": drift_summary,
    }
    iter_resp = client.table("iterations").insert(iter_payload).execute()
    iteration_id = _extract_inserted_id(iter_resp, "iterations", iteration_num)

    if scored_rules:
        client.table("rules").insert(
            [
                {
                    "iteration_id": iteration_id,
                    "antecedents": r["antecedents"],
                    "consequents": r["consequents"],
                    "support": r["support"],
                    "confidence": r["confidence"],
                    "lift": r["lift"],
                    "leverage": r["leverage"],
                    "conviction": r["conviction"],
                    "score": r["score"],
                }
                for r in scored_rules
            ]
        ).execute()

    if itemsets:
        client.table("itemsets").insert(
            [
                {
                    "iteration_id": iteration_id,
                    "itemset": itemset["itemset"],
                    "support": itemset["support"],
                    "item_count": len(itemset["itemset"]),
                }
                for itemset in itemsets
            ]
        ).execute()

    if price_map:
        client.table("price_map").insert(
            [{"iteration_id": iteration_id, "item": item, "avg_price": price} for item, price in price_map.items()]
        ).execute()

    rec_rows = [{"iteration_id": iteration_id, "rec_type": rec_type, "data": data} for rec_type, data in recs.items()]
    if rec_rows:
        client.table("recommendations").insert(rec_rows).execute()

    if drift and prev_iter_id:
        drift_rows = [
            {
                "from_iteration": prev_iter_id,
                "to_iteration": iteration_id,
                "rule_key": dr["key"],
                "status": dr["status"],
                "lift_delta": dr["lift_delta"],
                "supp_delta": dr["supp_delta"],
                "conf_delta": dr["conf_delta"],
                "score_delta": dr["score_delta"],
            }
            for dr in drift.get("drift_report", [])
        ]
        if drift_rows:
            client.table("drift_log").insert(drift_rows).execute()

    logger.info("Saved iteration %s (id=%s) to Supabase.", iteration_num, iteration_id)
    return iteration_id


def get_all_iterations() -> List[Dict]:
    resp = get_client().table("iterations").select("*").order("id", desc=True).execute()
    rows = resp.data or []
    for row in rows:
        row["drift_summary"] = _parse_json_if_needed(row.get("drift_summary"))
    return rows


def get_latest_iteration() -> Optional[Dict]:
    resp = get_client().table("iterations").select("*").order("id", desc=True).limit(1).execute()
    rows = resp.data or []
    if not rows:
        return None
    row = rows[0]
    row["drift_summary"] = _parse_json_if_needed(row.get("drift_summary"))
    return row


def get_iteration_rules(iteration_id: int) -> List[Dict]:
    resp = get_client().table("rules").select("*").eq("iteration_id", iteration_id).order("score", desc=True).execute()
    rows = resp.data or []
    for row in rows:
        row["antecedents"] = _parse_json_if_needed(row.get("antecedents"))
        row["consequents"] = _parse_json_if_needed(row.get("consequents"))
    return rows


def get_iteration_recommendations(iteration_id: int, rec_type: Optional[str] = None) -> Dict:
    query = get_client().table("recommendations").select("rec_type,data").eq("iteration_id", iteration_id)
    if rec_type:
        query = query.eq("rec_type", rec_type)
    resp = query.execute()
    rows = resp.data or []
    return {row["rec_type"]: _parse_json_if_needed(row["data"]) for row in rows}


def get_latest_rules() -> List[Dict]:
    latest = get_latest_iteration()
    if not latest:
        return []
    return get_iteration_rules(int(latest["id"]))


def get_latest_recommendations(rec_type: Optional[str] = None) -> Dict:
    latest = get_latest_iteration()
    if not latest:
        return {}
    return get_iteration_recommendations(int(latest["id"]), rec_type)


def get_price_map(iteration_id: int) -> Dict[str, float]:
    resp = get_client().table("price_map").select("item,avg_price").eq("iteration_id", iteration_id).execute()
    rows = resp.data or []
    return {row["item"]: row["avg_price"] for row in rows}


def get_iteration_itemsets(iteration_id: int) -> List[Dict]:
    resp = get_client().table("itemsets").select("itemset,support,item_count").eq("iteration_id", iteration_id).execute()
    rows = resp.data or []
    return [{"itemset": _parse_json_if_needed(row["itemset"]), "support": row["support"]} for row in rows]


def save_cleaned_rows(iteration_id: int, rows: List[Dict]) -> None:
    """Persist cleaned/canonical transaction rows for long-term re-training."""
    if not rows:
        return
    payload = [{"iteration_id": iteration_id, "row_data": row} for row in rows]
    get_client().table("cleaned_rows").insert(payload).execute()


def get_all_cleaned_rows() -> List[Dict]:
    """Retrieve all previously cleaned rows in ingestion order."""
    resp = get_client().table("cleaned_rows").select("row_data").order("id").execute()
    rows = resp.data or []
    return [_parse_json_if_needed(row["row_data"]) for row in rows]


def clear_all_data() -> Dict[str, int]:
    """
    Remove all persisted analysis data across all iterations.
    Returns deleted row counts per table.
    """
    client = get_client()
    tables = ["drift_log", "recommendations", "rules", "itemsets", "price_map", "cleaned_rows", "iterations"]
    counts: Dict[str, int] = {}

    for table in tables:
        rows = client.table(table).select("id").execute().data or []
        counts[table] = len(rows)

    for table in tables:
        client.table(table).delete().gt("id", 0).execute()

    logger.info("Cleared all Supabase data.")
    return counts

