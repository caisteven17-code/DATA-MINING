"""
database.py
===========
SQLite storage layer for Byteme.
Stores all iterations, rules, recommendations, and metadata.
"""

import sqlite3
import json
import os
from datetime import datetime
from typing import List, Dict, Optional, Any
from pathlib import Path
import logging

logger = logging.getLogger("byteme.database")

DB_PATH = os.environ.get("BYTEME_DB", "data/byteme.db")


def get_connection() -> sqlite3.Connection:
    """Return a SQLite connection with row_factory for dict access."""
    os.makedirs(os.path.dirname(DB_PATH) if os.path.dirname(DB_PATH) else ".", exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL;")  # better concurrent read performance
    conn.execute("PRAGMA foreign_keys=ON;")
    return conn


def init_db():
    """Create all tables if they don't exist."""
    conn = get_connection()
    c = conn.cursor()

    # ── iterations: one record per CSV upload ─────────────────────────────────
    c.execute("""
    CREATE TABLE IF NOT EXISTS iterations (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        iteration_num   INTEGER NOT NULL,
        file_name       TEXT NOT NULL,
        uploaded_at     TEXT NOT NULL,
        total_rows      INTEGER,
        baskets         INTEGER,
        unique_items    INTEGER,
        avg_basket_size REAL,
        date_earliest   TEXT,
        date_latest     TEXT,
        min_support     REAL,
        min_confidence  REAL,
        rules_count     INTEGER,
        avg_lift        REAL,
        stability_score REAL,
        drift_summary   TEXT  -- JSON blob
    )
    """)

    # ── rules: association rules per iteration ────────────────────────────────
    c.execute("""
    CREATE TABLE IF NOT EXISTS rules (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        iteration_id    INTEGER NOT NULL REFERENCES iterations(id),
        antecedents     TEXT NOT NULL,  -- JSON array
        consequents     TEXT NOT NULL,  -- JSON array
        support         REAL,
        confidence      REAL,
        lift            REAL,
        leverage        REAL,
        conviction      REAL,
        score           REAL
    )
    """)

    # ── itemsets: frequent itemsets per iteration ─────────────────────────────
    c.execute("""
    CREATE TABLE IF NOT EXISTS itemsets (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        iteration_id    INTEGER NOT NULL REFERENCES iterations(id),
        itemset         TEXT NOT NULL,  -- JSON array
        support         REAL,
        item_count      INTEGER
    )
    """)

    # ── recommendations: cached recommendation outputs ────────────────────────
    c.execute("""
    CREATE TABLE IF NOT EXISTS recommendations (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        iteration_id    INTEGER NOT NULL REFERENCES iterations(id),
        rec_type        TEXT NOT NULL,  -- 'homepage','bundles','fbt','promos','insights'
        data            TEXT NOT NULL   -- JSON blob
    )
    """)

    # ── drift_log: rule-level drift between iterations ────────────────────────
    c.execute("""
    CREATE TABLE IF NOT EXISTS drift_log (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        from_iteration  INTEGER REFERENCES iterations(id),
        to_iteration    INTEGER REFERENCES iterations(id),
        rule_key        TEXT,
        status          TEXT,
        lift_delta      REAL,
        supp_delta      REAL,
        conf_delta      REAL,
        score_delta     REAL
    )
    """)

    # ── price_map: item → average price per iteration ─────────────────────────
    c.execute("""
    CREATE TABLE IF NOT EXISTS price_map (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        iteration_id    INTEGER NOT NULL REFERENCES iterations(id),
        item            TEXT NOT NULL,
        avg_price       REAL
    )
    """)

    conn.commit()
    conn.close()
    logger.info(f"Database initialized at {DB_PATH}")


# ─── WRITE OPERATIONS ─────────────────────────────────────────────────────────

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
    """Save a complete iteration to the database. Returns the new iteration_id."""
    conn = get_connection()
    c = conn.cursor()

    # Get next iteration number
    c.execute("SELECT COALESCE(MAX(iteration_num), 0) + 1 FROM iterations")
    iteration_num = c.fetchone()[0]

    drift_summary = json.dumps(drift["summary"]) if drift else None
    stability     = drift["summary"]["stability_score"] if drift else None

    # Insert iteration record
    c.execute("""
    INSERT INTO iterations (
        iteration_num, file_name, uploaded_at,
        total_rows, baskets, unique_items, avg_basket_size,
        date_earliest, date_latest,
        min_support, min_confidence,
        rules_count, avg_lift, stability_score, drift_summary
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        iteration_num,
        file_name,
        datetime.utcnow().isoformat(),
        prep_meta.get("total_rows"),
        prep_meta.get("baskets"),
        prep_meta.get("unique_items"),
        prep_meta.get("avg_basket_size"),
        prep_meta.get("date_range", {}).get("earliest"),
        prep_meta.get("date_range", {}).get("latest"),
        mining_result.get("min_support"),
        mining_result.get("min_confidence"),
        len(scored_rules),
        (sum(r["lift"] for r in scored_rules) / len(scored_rules)) if scored_rules else 0,
        stability,
        drift_summary,
    ))
    iteration_id = c.lastrowid

    # Insert rules
    c.executemany(
        "INSERT INTO rules (iteration_id, antecedents, consequents, support, confidence, lift, leverage, conviction, score) VALUES (?,?,?,?,?,?,?,?,?)",
        [(
            iteration_id,
            json.dumps(r["antecedents"]),
            json.dumps(r["consequents"]),
            r["support"], r["confidence"], r["lift"],
            r["leverage"], r["conviction"], r["score"],
        ) for r in scored_rules]
    )

    # Insert itemsets
    c.executemany(
        "INSERT INTO itemsets (iteration_id, itemset, support, item_count) VALUES (?,?,?,?)",
        [(iteration_id, json.dumps(is_["itemset"]), is_["support"], len(is_["itemset"]))
         for is_ in itemsets]
    )

    # Insert price map
    c.executemany(
        "INSERT INTO price_map (iteration_id, item, avg_price) VALUES (?,?,?)",
        [(iteration_id, item, price) for item, price in price_map.items()]
    )

    # Insert recommendations
    for rec_type, data in recs.items():
        c.execute(
            "INSERT INTO recommendations (iteration_id, rec_type, data) VALUES (?,?,?)",
            (iteration_id, rec_type, json.dumps(data))
        )

    # Insert drift log
    if drift:
        prev_iter_id = _get_prev_iteration_id(c)
        if prev_iter_id and prev_iter_id != iteration_id:
            c.executemany(
                "INSERT INTO drift_log (from_iteration, to_iteration, rule_key, status, lift_delta, supp_delta, conf_delta, score_delta) VALUES (?,?,?,?,?,?,?,?)",
                [(
                    prev_iter_id, iteration_id,
                    dr["key"], dr["status"],
                    dr["lift_delta"], dr["supp_delta"],
                    dr["conf_delta"], dr["score_delta"],
                ) for dr in drift["drift_report"]]
            )

    conn.commit()
    conn.close()
    logger.info(f"Saved iteration {iteration_num} (id={iteration_id}) to database.")
    return iteration_id


def _get_prev_iteration_id(cursor) -> Optional[int]:
    """Get the second-most-recent iteration id."""
    cursor.execute("SELECT id FROM iterations ORDER BY id DESC LIMIT 2")
    rows = cursor.fetchall()
    return rows[1]["id"] if len(rows) >= 2 else None


# ─── READ OPERATIONS ──────────────────────────────────────────────────────────

def _row_to_dict(row) -> Dict:
    return dict(row) if row else {}


def get_all_iterations() -> List[Dict]:
    conn = get_connection()
    c = conn.cursor()
    c.execute("SELECT * FROM iterations ORDER BY id DESC")
    rows = [dict(r) for r in c.fetchall()]
    conn.close()
    # Parse JSON fields
    for r in rows:
        if r.get("drift_summary"):
            try:
                r["drift_summary"] = json.loads(r["drift_summary"])
            except Exception:
                pass
    return rows


def get_latest_iteration() -> Optional[Dict]:
    conn = get_connection()
    c = conn.cursor()
    c.execute("SELECT * FROM iterations ORDER BY id DESC LIMIT 1")
    row = c.fetchone()
    conn.close()
    if not row:
        return None
    r = dict(row)
    if r.get("drift_summary"):
        try:
            r["drift_summary"] = json.loads(r["drift_summary"])
        except Exception:
            pass
    return r


def get_iteration_rules(iteration_id: int) -> List[Dict]:
    conn = get_connection()
    c = conn.cursor()
    c.execute("SELECT * FROM rules WHERE iteration_id=? ORDER BY score DESC", (iteration_id,))
    rows = c.fetchall()
    conn.close()
    result = []
    for r in rows:
        d = dict(r)
        d["antecedents"] = json.loads(d["antecedents"])
        d["consequents"] = json.loads(d["consequents"])
        result.append(d)
    return result


def get_iteration_recommendations(iteration_id: int, rec_type: Optional[str] = None) -> Dict:
    conn = get_connection()
    c = conn.cursor()
    if rec_type:
        c.execute("SELECT rec_type, data FROM recommendations WHERE iteration_id=? AND rec_type=?",
                  (iteration_id, rec_type))
    else:
        c.execute("SELECT rec_type, data FROM recommendations WHERE iteration_id=?", (iteration_id,))
    rows = c.fetchall()
    conn.close()
    return {r["rec_type"]: json.loads(r["data"]) for r in rows}


def get_latest_rules() -> List[Dict]:
    latest = get_latest_iteration()
    if not latest:
        return []
    return get_iteration_rules(latest["id"])


def get_latest_recommendations(rec_type: Optional[str] = None) -> Dict:
    latest = get_latest_iteration()
    if not latest:
        return {}
    return get_iteration_recommendations(latest["id"], rec_type)


def get_price_map(iteration_id: int) -> Dict[str, float]:
    conn = get_connection()
    c = conn.cursor()
    c.execute("SELECT item, avg_price FROM price_map WHERE iteration_id=?", (iteration_id,))
    rows = c.fetchall()
    conn.close()
    return {r["item"]: r["avg_price"] for r in rows}


def get_iteration_itemsets(iteration_id: int) -> List[Dict]:
    conn = get_connection()
    c = conn.cursor()
    c.execute("SELECT itemset, support, item_count FROM itemsets WHERE iteration_id=?", (iteration_id,))
    rows = c.fetchall()
    conn.close()
    return [{"itemset": json.loads(r["itemset"]), "support": r["support"]} for r in rows]


def clear_all_data() -> Dict[str, int]:
    """
    Remove all persisted analysis data across all iterations.
    Returns deleted row counts per table.
    """
    conn = get_connection()
    c = conn.cursor()

    tables = ["drift_log", "recommendations", "rules", "itemsets", "price_map", "iterations"]
    counts: Dict[str, int] = {}

    for table in tables:
        c.execute(f"SELECT COUNT(*) AS n FROM {table}")
        counts[table] = int(c.fetchone()["n"])

    for table in tables:
        c.execute(f"DELETE FROM {table}")

    c.execute(
        "DELETE FROM sqlite_sequence WHERE name IN ('drift_log','recommendations','rules','itemsets','price_map','iterations')"
    )

    conn.commit()
    conn.close()
    logger.info("Cleared all database data.")
    return counts
