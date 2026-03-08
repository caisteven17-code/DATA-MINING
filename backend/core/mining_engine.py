"""
mining_engine.py
================
FP-Growth implementation for Byteme Market Basket Analysis.

WHY FP-GROWTH OVER APRIORI?
─────────────────────────────────────────────────────────────────────────────
Apriori uses a "generate-and-test" strategy: it creates candidate itemsets
and scans the database repeatedly for each candidate level. For a fast-food
dataset with ~3000 transactions and ~25+ menu items this creates O(2^n) 
candidate sets and multiple passes over the data.

FP-Growth (Frequent Pattern Growth) builds a compact FP-Tree in only TWO 
database scans, then mines patterns via conditional pattern-base recursion 
WITHOUT generating explicit candidates. It's 10-100x faster than Apriori 
on dense datasets like restaurant transactions where customers frequently 
buy 3-6 items per visit.

WHY FP-GROWTH FITS THIS DATASET:
  1. Dense baskets (avg 3-6 items) → FP-Tree shares many common prefixes
  2. Small vocabulary (~25 items) → small, shallow FP-Tree
  3. Frequent re-uploads → speed matters for quick feedback
  4. Need combo analysis (3+ items) → Apriori gets exponentially slow

TRADEOFFS:
  Speed:       FP-Growth >> Apriori (2 scans vs. n*k scans)
  Memory:      FP-Tree fits entirely in RAM for typical restaurant data
  Scalability: FP-Growth scales to millions of transactions with same 2-scan
  Basket density: FP-Growth benefits MORE from dense baskets (this dataset)
"""

from collections import defaultdict
from itertools import combinations
from typing import List, Dict, Tuple, Optional
import math


# ─── FP-TREE DATA STRUCTURES ──────────────────────────────────────────────────

class FPNode:
    """A single node in the FP-Tree."""
    def __init__(self, item: Optional[str], count: int, parent: Optional["FPNode"]):
        self.item = item
        self.count = count
        self.parent = parent
        self.children: Dict[str, "FPNode"] = {}
        self.link: Optional["FPNode"] = None  # header table link

    def __repr__(self):
        return f"FPNode({self.item!r}, count={self.count})"


class FPTree:
    """
    Compact prefix-tree representation of transaction data.
    Each path from root to leaf encodes a set of co-occurring items.
    """
    def __init__(self):
        self.root = FPNode(None, 0, None)
        self.header: Dict[str, List[FPNode]] = defaultdict(list)
        self.freq: Dict[str, int] = defaultdict(int)  # global item frequencies

    def insert(self, transaction: List[str], count: int = 1):
        """Insert one transaction (sorted by frequency desc) into the tree."""
        node = self.root
        for item in transaction:
            self.freq[item] += count
            if item in node.children:
                node.children[item].count += count
            else:
                child = FPNode(item, count, node)
                node.children[item] = child
                self.header[item].append(child)
            node = node.children[item]

    def conditional_pattern_base(self, item: str) -> List[Tuple[List[str], int]]:
        """Extract all prefix paths that lead to nodes containing `item`."""
        patterns = []
        for node in self.header.get(item, []):
            path, ancestor = [], node.parent
            while ancestor and ancestor.item is not None:
                path.append(ancestor.item)
                ancestor = ancestor.parent
            if path:
                patterns.append((list(reversed(path)), node.count))
        return patterns


def _build_tree(transactions: List[Tuple[List[str], int]], min_count: int) -> Tuple[Optional[FPTree], Dict[str, int]]:
    """Build an FP-Tree from a list of (transaction, count) pairs."""
    # Pass 1: count frequencies
    freq: Dict[str, int] = defaultdict(int)
    for trans, cnt in transactions:
        for item in trans:
            freq[item] += cnt

    # Keep only items meeting minimum support
    freq = {item: cnt for item, cnt in freq.items() if cnt >= min_count}
    if not freq:
        return None, {}

    # Sort items by frequency desc (FP-Tree canonical order)
    order = sorted(freq, key=lambda x: -freq[x])
    rank = {item: i for i, item in enumerate(order)}

    # Pass 2: build tree
    tree = FPTree()
    for trans, cnt in transactions:
        filtered = sorted([i for i in trans if i in freq], key=lambda x: rank[x])
        if filtered:
            tree.insert(filtered, cnt)

    return tree, freq


def _fpgrowth_recursive(
    tree: FPTree,
    freq: Dict[str, int],
    min_count: int,
    prefix: List[str],
    results: List[Tuple[List[str], int]]
):
    """Recursively mine frequent itemsets via conditional FP-Trees."""
    # Process items in ascending frequency order (bottom-up)
    for item in sorted(freq, key=lambda x: freq[x]):
        new_itemset = sorted(prefix + [item])
        results.append((new_itemset, freq[item]))

        # Build conditional pattern base and conditional FP-Tree
        cond_patterns = tree.conditional_pattern_base(item)
        if not cond_patterns:
            continue
        cond_tree, cond_freq = _build_tree(cond_patterns, min_count)
        if cond_tree and cond_freq:
            _fpgrowth_recursive(cond_tree, cond_freq, min_count, new_itemset, results)


def fpgrowth(
    baskets: List[List[str]],
    min_support: float,
    max_len: int = 4
) -> List[Dict]:
    """
    Run FP-Growth on a list of baskets.

    Args:
        baskets:     List of transactions (each is a list of item strings)
        min_support: Fraction of transactions [0,1] an itemset must appear in
        max_len:     Maximum itemset size to mine (default 4)

    Returns:
        List of dicts with keys: itemset, support, count
    """
    n = len(baskets)
    if n == 0:
        return []

    min_count = max(1, math.ceil(min_support * n))
    transactions = [(list(set(b)), 1) for b in baskets]  # deduplicate items per basket

    tree, freq = _build_tree(transactions, min_count)
    if not tree:
        return []

    raw_results: List[Tuple[List[str], int]] = []
    _fpgrowth_recursive(tree, freq, min_count, [], raw_results)

    # Add singletons (they appear only in the header, not recursive calls)
    for item, count in freq.items():
        raw_results.append(([item], count))

    # Deduplicate and filter by max_len
    seen = set()
    itemsets = []
    for itemset, count in raw_results:
        if len(itemset) > max_len:
            continue
        key = "|".join(sorted(itemset))
        if key not in seen:
            seen.add(key)
            itemsets.append({
                "itemset": sorted(itemset),
                "support": round(count / n, 6),
                "count": count,
            })

    return sorted(itemsets, key=lambda x: -x["support"])


# ─── ASSOCIATION RULES ────────────────────────────────────────────────────────

def generate_association_rules(
    itemsets: List[Dict],
    min_confidence: float
) -> List[Dict]:
    """
    Generate association rules from frequent itemsets.
    
    Metrics computed:
      support    = P(A ∪ B)
      confidence = P(B|A) = P(A ∪ B) / P(A)
      lift       = confidence / P(B)  →  >1 means positive correlation
      leverage   = P(A ∪ B) - P(A)*P(B)  →  how much better than random
      conviction = (1-P(B)) / (1-confidence)  →  >1 means rule is directional
    """
    # Build lookup: sorted_key → support
    support_map: Dict[str, float] = {
        "|".join(sorted(is_["itemset"])): is_["support"]
        for is_ in itemsets
    }

    rules = []
    for is_dict in itemsets:
        itemset = is_dict["itemset"]
        if len(itemset) < 2:
            continue

        full_support = is_dict["support"]

        # Try every non-empty, non-full subset as antecedent
        for r in range(1, len(itemset)):
            for ant in combinations(itemset, r):
                ant = list(ant)
                con = [i for i in itemset if i not in ant]
                if not con:
                    continue

                ant_key = "|".join(sorted(ant))
                con_key = "|".join(sorted(con))

                ant_support = support_map.get(ant_key)
                con_support = support_map.get(con_key)
                if not ant_support or not con_support:
                    continue

                confidence = full_support / ant_support
                if confidence < min_confidence:
                    continue

                lift = confidence / con_support
                leverage = full_support - ant_support * con_support
                conviction = (
                    (1 - con_support) / (1 - confidence)
                    if confidence < 1
                    else 999.0
                )

                rules.append({
                    "antecedents": sorted(ant),
                    "consequents": sorted(con),
                    "support":    round(full_support, 6),
                    "confidence": round(confidence, 6),
                    "lift":       round(lift, 6),
                    "leverage":   round(leverage, 6),
                    "conviction": round(min(conviction, 999), 6),
                })

    return rules


# ─── AUTO-THRESHOLD TUNING ────────────────────────────────────────────────────

TARGET_RULE_MIN = 20
TARGET_RULE_MAX = 80


def _clamp01(value: float) -> float:
    return max(0.0, min(1.0, value))


def _rule_count_score(n_rules: int) -> float:
    """Score how close rule count is to the target window [TARGET_RULE_MIN, TARGET_RULE_MAX]."""
    if TARGET_RULE_MIN <= n_rules <= TARGET_RULE_MAX:
        return 1.0
    dist = min(abs(n_rules - TARGET_RULE_MIN), abs(n_rules - TARGET_RULE_MAX))
    return _clamp01(1.0 - (dist / TARGET_RULE_MAX))


def auto_tune(baskets: List[List[str]], prev_rules: Optional[List[Dict]] = None) -> Dict:
    """
    Intelligent threshold selection strategy.
    
    Instead of fixed min_support/min_confidence, we search a grid and score
    each candidate using three factors:
      1. Rule-count target fit (20-80 rules)
      2. Rule quality (avg score + avg lift)
      3. Rule stability vs previous iteration (when previous rules exist)
    """
    # Lazy import to avoid module coupling at import time.
    from backend.core.scoring_engine import score_rules, compute_drift

    supports = [0.05, 0.04, 0.03, 0.025, 0.02, 0.015, 0.01, 0.008, 0.005]
    confs    = [0.30, 0.28, 0.25, 0.20, 0.15, 0.10, 0.08, 0.05, 0.03]

    best = {
        "min_support": supports[0],
        "min_confidence": confs[0],
        "itemsets": [],
        "rules": [],
        "objective": float("-inf"),
        "quality_score": 0.0,
        "stability_score": 0.0,
        "count_score": 0.0,
    }

    use_stability = bool(prev_rules)

    for sup in supports:
        itemsets = fpgrowth(baskets, sup)
        if not itemsets:
            continue

        for conf in confs:
            rules = generate_association_rules(itemsets, conf)
            scored_rules = score_rules(rules)
            n_rules = len(scored_rules)

            count_score = _rule_count_score(n_rules)
            avg_score = (sum(r["score"] for r in scored_rules) / n_rules) if n_rules else 0.0
            avg_lift = (sum(r["lift"] for r in scored_rules) / n_rules) if n_rules else 0.0
            # Score blend: score is in [0,1], lift normalization caps at 3x.
            quality_score = _clamp01(0.6 * avg_score + 0.4 * _clamp01(avg_lift / 3.0))

            stability_score = 0.0
            if use_stability and n_rules:
                drift = compute_drift(prev_rules, scored_rules)
                stability_score = _clamp01((drift["summary"].get("stability_score", 0.0) or 0.0) / 100.0)

            if use_stability:
                objective = (
                    0.45 * count_score +
                    0.30 * quality_score +
                    0.25 * stability_score
                )
            else:
                objective = (
                    0.65 * count_score +
                    0.35 * quality_score
                )

            better = objective > best["objective"]
            tie = math.isclose(objective, best["objective"], abs_tol=1e-9)
            tie_break = tie and (sup > best["min_support"] or (sup == best["min_support"] and conf > best["min_confidence"]))

            if better or tie_break:
                best.update({
                    "min_support": sup,
                    "min_confidence": conf,
                    "itemsets": itemsets,
                    "rules": rules,
                    "objective": objective,
                    "quality_score": quality_score,
                    "stability_score": stability_score,
                    "count_score": count_score,
                })

    return {
        "min_support":    best["min_support"],
        "min_confidence": best["min_confidence"],
        "itemsets":       best["itemsets"],
        "rules":          best["rules"],
        "tuning": {
            "objective": round(best["objective"], 6),
            "count_score": round(best["count_score"], 6),
            "quality_score": round(best["quality_score"], 6),
            "stability_score": round(best["stability_score"], 6),
            "uses_stability": use_stability,
        },
    }
