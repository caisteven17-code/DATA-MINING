"""
scoring_engine.py
=================
Multi-metric rule scoring and self-learning drift detection for Byteme.

SCORING WEIGHTS (same as browser engine for consistency):
  Lift (normalized):       35%  — measures how much better than random
  Confidence:              30%  — directional reliability of rule
  Support (raw):           20%  — how commonly the pattern occurs
  Conviction (normalized): 15%  — strength of implication direction

DRIFT DETECTION:
  Between iterations we track how each rule's score, lift, support, and
  confidence shift. Rules are classified as: new, lost, stable, improved,
  declined, or volatile. This gives the owner actionable intelligence:
    - "improved" rules → double down on those bundles
    - "declined" rules → reduce focus / investigate cause
    - "volatile" rules → patterns that depend on external factors (seasons, events)
    - "new" rules      → emerging customer behavior to capitalize on
    - "lost" rules     → bundles that no longer resonate
"""

from typing import List, Dict, Optional
import math


# ─── NORMALIZATION HELPERS ────────────────────────────────────────────────────

def _minmax_normalize(values: List[float]) -> List[float]:
    """Scale a list of floats to [0, 1]."""
    if not values:
        return values
    mn, mx = min(values), max(values)
    if mx == mn:
        return [0.5] * len(values)
    return [(v - mn) / (mx - mn) for v in values]


# ─── RULE SCORING ─────────────────────────────────────────────────────────────

def score_rules(rules: List[Dict]) -> List[Dict]:
    """
    Attach a composite score to each rule.
    Score = 0.35*lift_norm + 0.30*confidence + 0.20*support + 0.15*conviction_norm

    Lift and conviction are normalized because their raw scales differ wildly.
    Confidence and support are already in [0, 1] so no normalization needed.
    """
    if not rules:
        return []

    lift_norm  = _minmax_normalize([r["lift"]       for r in rules])
    conv_norm  = _minmax_normalize([min(r["conviction"], 10) for r in rules])

    scored = []
    for i, rule in enumerate(rules):
        score = (
            0.35 * lift_norm[i]
            + 0.30 * rule["confidence"]
            + 0.20 * rule["support"]
            + 0.15 * conv_norm[i]
        )
        scored.append({**rule, "lift_norm": round(lift_norm[i], 6),
                       "conviction_norm": round(conv_norm[i], 6),
                       "score": round(score, 6)})

    return sorted(scored, key=lambda x: -x["score"])


# ─── DRIFT DETECTION ──────────────────────────────────────────────────────────

def _rule_key(rule: Dict) -> str:
    """Unique string identity for a rule: antecedents → consequents."""
    ant = ", ".join(sorted(rule["antecedents"]))
    con = ", ".join(sorted(rule["consequents"]))
    return f"{ant} → {con}"


def _classify_drift(prev: Optional[Dict], curr: Optional[Dict]) -> str:
    """
    Classify the change status of a rule between two iterations.
    
    Criteria (tuned for fast-food basket data):
      volatile:  lift shifted >0.3 AND support shifted >0.02 simultaneously
      improved:  score increased by more than 0.05
      declined:  score decreased by more than 0.05
      stable:    everything else (survived with minor changes)
      new:       rule exists in curr but not prev
      lost:      rule exists in prev but not curr
    """
    if prev is None:
        return "new"
    if curr is None:
        return "lost"

    lift_delta  = curr["lift"]  - prev["lift"]
    supp_delta  = curr["support"] - prev["support"]
    score_delta = curr["score"] - prev["score"]

    if abs(lift_delta) > 0.3 and abs(supp_delta) > 0.02:
        return "volatile"
    if score_delta > 0.05:
        return "improved"
    if score_delta < -0.05:
        return "declined"
    return "stable"


def compute_drift(prev_rules: Optional[List[Dict]], curr_rules: List[Dict]) -> Dict:
    """
    Compare two rule sets (from consecutive iterations) and produce a drift report.
    
    Returns:
      drift_report: list of per-rule change records
      summary:      aggregate statistics + stability score + top gainers/fallers
    """
    prev_map = {_rule_key(r): r for r in (prev_rules or [])}
    curr_map = {_rule_key(r): r for r in curr_rules}
    all_keys = set(prev_map) | set(curr_map)

    drift_report = []
    for key in all_keys:
        prev = prev_map.get(key)
        curr = curr_map.get(key)
        status = _classify_drift(prev, curr)
        drift_report.append({
            "key":        key,
            "status":     status,
            "prev":       {k: prev[k] for k in ("support","confidence","lift","score")} if prev else None,
            "curr":       {k: curr[k] for k in ("support","confidence","lift","score")} if curr else None,
            "lift_delta":  round(curr["lift"]  - prev["lift"],  4) if prev and curr else None,
            "supp_delta":  round(curr["support"] - prev["support"], 4) if prev and curr else None,
            "conf_delta":  round(curr["confidence"] - prev["confidence"], 4) if prev and curr else None,
            "score_delta": round(curr["score"] - prev["score"], 4) if prev and curr else None,
        })

    statuses = [r["status"] for r in drift_report]
    survived  = [r for r in drift_report if r["status"] not in ("lost", "new")]
    stable_or_better = [r for r in survived if r["status"] in ("stable", "improved")]
    stability_score = (
        round(len(stable_or_better) / len(survived) * 100, 1) if survived else 100.0
    )

    # Top gainers/fallers by lift delta
    delta_rules = [r for r in drift_report if r["lift_delta"] is not None]
    top_gainers = sorted(delta_rules, key=lambda r: -(r["lift_delta"] or 0))[:3]
    top_fallers = sorted(delta_rules, key=lambda r: (r["lift_delta"] or 0))[:3]

    summary = {
        "total":           len(all_keys),
        "stable":          statuses.count("stable"),
        "improved":        statuses.count("improved"),
        "declined":        statuses.count("declined"),
        "new":             statuses.count("new"),
        "lost":            statuses.count("lost"),
        "volatile":        statuses.count("volatile"),
        "stability_score": stability_score,
        "top_gainers":     top_gainers,
        "top_fallers":     top_fallers,
    }

    return {"drift_report": drift_report, "summary": summary}
