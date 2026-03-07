-- ============================================================
-- Byteme MBA System — SQLite Database Schema
-- Created automatically by database.py on first run
-- ============================================================

-- One record per CSV upload (one per iteration)
CREATE TABLE IF NOT EXISTS iterations (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    iteration_num   INTEGER NOT NULL,      -- 1, 2, 3 ...
    file_name       TEXT NOT NULL,         -- original CSV filename
    uploaded_at     TEXT NOT NULL,         -- ISO timestamp UTC
    total_rows      INTEGER,               -- rows in uploaded CSV
    baskets         INTEGER,               -- valid baskets after cleaning
    unique_items    INTEGER,               -- distinct menu items found
    avg_basket_size REAL,                  -- mean items per transaction
    date_earliest   TEXT,                  -- earliest transaction datetime
    date_latest     TEXT,                  -- latest transaction datetime
    min_support     REAL,                  -- auto-tuned minimum support
    min_confidence  REAL,                  -- auto-tuned minimum confidence
    rules_count     INTEGER,               -- number of rules generated
    avg_lift        REAL,                  -- average lift across all rules
    stability_score REAL,                  -- % of rules stable vs prior iteration
    drift_summary   TEXT                   -- JSON: {stable, improved, declined, ...}
);

-- Association rules per iteration
CREATE TABLE IF NOT EXISTS rules (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    iteration_id    INTEGER NOT NULL REFERENCES iterations(id),
    antecedents     TEXT NOT NULL,         -- JSON array e.g. ["Burger"]
    consequents     TEXT NOT NULL,         -- JSON array e.g. ["Fries", "Coke"]
    support         REAL,                  -- P(A ∪ B)
    confidence      REAL,                  -- P(B|A)
    lift            REAL,                  -- confidence / P(B)
    leverage        REAL,                  -- P(A∪B) - P(A)*P(B)
    conviction      REAL,                  -- (1-P(B)) / (1-confidence)
    score           REAL                   -- composite: 0.35*lift+0.30*conf+0.20*sup+0.15*conv
);

-- Frequent itemsets per iteration
CREATE TABLE IF NOT EXISTS itemsets (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    iteration_id    INTEGER NOT NULL REFERENCES iterations(id),
    itemset         TEXT NOT NULL,         -- JSON sorted array
    support         REAL,                  -- fraction of baskets containing itemset
    item_count      INTEGER                -- itemset size (1, 2, 3...)
);

-- Cached recommendation outputs per iteration
CREATE TABLE IF NOT EXISTS recommendations (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    iteration_id    INTEGER NOT NULL REFERENCES iterations(id),
    rec_type        TEXT NOT NULL,         -- 'homepage','bundles','fbt','crosssell','promos','insights'
    data            TEXT NOT NULL          -- full JSON blob
);

-- Rule-level drift log between consecutive iterations
CREATE TABLE IF NOT EXISTS drift_log (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    from_iteration  INTEGER REFERENCES iterations(id),
    to_iteration    INTEGER REFERENCES iterations(id),
    rule_key        TEXT,                  -- "Burger → Fries"
    status          TEXT,                  -- new|lost|stable|improved|declined|volatile
    lift_delta      REAL,
    supp_delta      REAL,
    conf_delta      REAL,
    score_delta     REAL
);

-- Average item prices per iteration
CREATE TABLE IF NOT EXISTS price_map (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    iteration_id    INTEGER NOT NULL REFERENCES iterations(id),
    item            TEXT NOT NULL,
    avg_price       REAL
);

-- ── Useful queries ────────────────────────────────────────────────────────────

-- Latest iteration summary
-- SELECT * FROM iterations ORDER BY id DESC LIMIT 1;

-- Top 10 rules by score for latest iteration
-- SELECT r.antecedents, r.consequents, r.lift, r.confidence, r.score
-- FROM rules r
-- JOIN (SELECT id FROM iterations ORDER BY id DESC LIMIT 1) i ON r.iteration_id = i.id
-- ORDER BY r.score DESC LIMIT 10;

-- Rule drift between last two iterations
-- SELECT * FROM drift_log ORDER BY to_iteration DESC LIMIT 100;

-- Bundle recommendations for latest
-- SELECT data FROM recommendations WHERE iteration_id = (SELECT MAX(id) FROM iterations) AND rec_type = 'bundles';
